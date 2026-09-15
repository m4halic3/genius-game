/**
 * src/core/AudioSynth.ts
 * Singleton de síntese sonora via Web Audio API nativa.
 * Sem dependência de arquivos externos; ondas geradas em tempo real.
 * Projetado para rodar 24/7 em modo kiosk: nunca deixa nós órfãos,
 * sempre agenda o próprio cleanup via onended.
 */

import { Quadrant, QUADRANT_FREQUENCY } from '../types/game';

interface AdsrEnvelope {
  attackMs: number;
  decayMs: number;
  sustainLevel: number; // 0..1
  releaseMs: number;
}

const DEFAULT_TONE_ENVELOPE: AdsrEnvelope = {
  attackMs: 8,
  decayMs: 60,
  sustainLevel: 0.65,
  releaseMs: 90,
};

const ERROR_ENVELOPE: AdsrEnvelope = {
  attackMs: 4,
  decayMs: 120,
  sustainLevel: 0.5,
  releaseMs: 220,
};

const MASTER_GAIN_DEFAULT = 0.22;

/**
 * AudioSynth é um singleton: um único AudioContext deve existir na aplicação
 * inteira. Múltiplos contextos em kiosk 24/7 vazam recursos do navegador.
 */
export class AudioSynth {
  private static instance: AudioSynth | null = null;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private readonly activeNodes = new Set<OscillatorNode>();

  private constructor() {}

  static getInstance(): AudioSynth {
    if (!AudioSynth.instance) {
      AudioSynth.instance = new AudioSynth();
    }
    return AudioSynth.instance;
  }

  /**
   * Deve ser chamado a partir de um gesto do usuário (toque/clique/tecla),
   * respeitando a política de autoplay dos navegadores. Idempotente.
   */
  async unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      // Ambiente sem suporte a Web Audio: falha silenciosa, jogo continua sem som.
      return;
    }
    this.ctx = new AudioContextCtor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = MASTER_GAIN_DEFAULT;
    this.masterGain.connect(this.ctx.destination);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Toca a nota senoidal correspondente a um quadrante. */
  playQuadrant(quadrant: Quadrant, durationMs: number): void {
    this.playTone(QUADRANT_FREQUENCY[quadrant], durationMs, 'sine', DEFAULT_TONE_ENVELOPE);
  }

  /** Toca o som de erro: dente-de-serra com glissando descendente. */
  playError(): void {
    this.playTone(160, 480, 'sawtooth', ERROR_ENVELOPE, { glideToHz: 90 });
  }

  private playTone(
    freqHz: number,
    durationMs: number,
    type: OscillatorType,
    envelope: AdsrEnvelope,
    opts?: { glideToHz?: number },
  ): void {
    if (this.muted || !this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const durationS = durationMs / 1000;
    const attackS = envelope.attackMs / 1000;
    const decayS = envelope.decayMs / 1000;
    const releaseS = envelope.releaseMs / 1000;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqHz, now);
    if (opts?.glideToHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(opts.glideToHz, 1), now + durationS);
    }

    // Envelope ADSR defensivo: nunca usa setValueAtTime(0, ...) seguido de
    // exponentialRamp (que lança RangeError para valor 0); usa linear no ataque
    // e no release para zero, exponential apenas entre valores > 0.
    const peak = 1;
    const sustain = Math.max(envelope.sustainLevel, 0.0001);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attackS);
    gain.gain.exponentialRampToValueAtTime(sustain, now + attackS + decayS);
    gain.gain.setValueAtTime(sustain, now + Math.max(durationS - releaseS, attackS + decayS));
    gain.gain.linearRampToValueAtTime(0.0001, now + durationS);

    osc.connect(gain);
    gain.connect(this.masterGain);

    this.activeNodes.add(osc);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.activeNodes.delete(osc);
    };

    osc.start(now);
    osc.stop(now + durationS + 0.02);
  }

  /**
   * Para todos os osciladores ativos imediatamente. Usado no cleanup
   * de partida (reset) para evitar sons "vazando" entre estados.
   */
  stopAll(): void {
    for (const osc of this.activeNodes) {
      try {
        osc.stop();
      } catch {
        // Oscilador já parado; ignora.
      }
    }
    this.activeNodes.clear();
  }

  /** Libera o AudioContext por completo. Chamar apenas no unmount final da app. */
  async dispose(): Promise<void> {
    this.stopAll();
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
