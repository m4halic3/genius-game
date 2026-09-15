/**
 * src/core/GameEngine.ts
 * Lógica de negócio pura. Zero import de DOM, zero side-effect visual/sonoro,
 * zero persistência (isso é responsabilidade da UI, via RankingStore).
 *
 * Modo DUPLA: os dois jogadores compartilham a MESMA sequência crescente,
 * alternando turno a cada rodada (jogador 1 repete, depois jogador 2 repete
 * a sequência idêntica). Cada jogador tem vidas independentes; quando um
 * esgota as vidas, o outro segue sozinho pelas rodadas seguintes.
 */

import {
  DEFAULT_CONFIG,
  GameConfig,
  GameEventListener,
  GameEventMap,
  GameEventName,
  GameMode,
  GameSnapshot,
  GameState,
  PlayerResult,
  PlayerState,
  Quadrant,
  QUADRANT_COUNT,
} from '../types/game';

/** Gera um índice de quadrante pseudoaleatório em O(1). */
function randomQuadrant(): Quadrant {
  return Math.floor(Math.random() * QUADRANT_COUNT) as Quadrant;
}

/**
 * Aguarda `ms` milissegundos, cancelável via AbortSignal.
 * Permite reset/cleanup em qualquer ponto de uma sequência assíncrona
 * sem deixar timers pendurados — essencial para um kiosk 24/7.
 */
function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export class GameEngine {
  private readonly config: GameConfig;
  private readonly listeners: Partial<{
    [K in GameEventName]: Set<GameEventListener<K>>;
  }> = {};

  private state: GameState = GameState.IDLE;
  private mode: GameMode = GameMode.SOLO;
  private players: PlayerState[] = [];
  private currentPlayerIndex = 0;

  private sequence: Quadrant[] = [];
  private inputCursor = 0;
  private round = 0;

  /** Controla o ciclo de vida de qualquer espera assíncrona em curso. */
  private playbackAbort: AbortController | null = null;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------
  // Event emitter (implementação mínima, sem dependências externas)
  // ---------------------------------------------------------------------

  on<K extends GameEventName>(event: K, listener: GameEventListener<K>): () => void {
    let set = this.listeners[event] as Set<GameEventListener<K>> | undefined;
    if (!set) {
      set = new Set<GameEventListener<K>>();
      (this.listeners as Record<GameEventName, Set<GameEventListener<GameEventName>>>)[event] =
        set as unknown as Set<GameEventListener<GameEventName>>;
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  off<K extends GameEventName>(event: K, listener: GameEventListener<K>): void {
    (this.listeners[event] as Set<GameEventListener<K>> | undefined)?.delete(listener);
  }

  private emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
    const set = this.listeners[event] as Set<GameEventListener<K>> | undefined;
    if (!set) return;
    for (const listener of set) listener(payload);
  }

  /** Remove todos os listeners. Chamar no unmount da UI para evitar leaks. */
  removeAllListeners(): void {
    for (const key of Object.keys(this.listeners) as GameEventName[]) {
      delete this.listeners[key];
    }
  }

  // ---------------------------------------------------------------------
  // Snapshot / estado público
  // ---------------------------------------------------------------------

  getSnapshot(activeQuadrant: Quadrant | null = null, errorQuadrant: Quadrant | null = null): GameSnapshot {
    return {
      state: this.state,
      mode: this.mode,
      round: this.round,
      players: this.players.map((p) => ({ ...p })),
      currentPlayerIndex: this.currentPlayerIndex,
      activeQuadrant,
      errorQuadrant,
    };
  }

  private setState(state: GameState, overrides?: { activeQuadrant?: Quadrant | null; errorQuadrant?: Quadrant | null }): void {
    this.state = state;
    this.emit('state-change', this.getSnapshot(overrides?.activeQuadrant ?? null, overrides?.errorQuadrant ?? null));
  }

  // ---------------------------------------------------------------------
  // Ciclo de vida da partida
  // ---------------------------------------------------------------------

  private cancelPlayback(): void {
    this.playbackAbort?.abort();
    this.playbackAbort = null;
  }

  /** Reseta para IDLE, sem jogadores definidos. Seguro a qualquer momento. */
  reset(): void {
    this.cancelPlayback();
    this.sequence = [];
    this.inputCursor = 0;
    this.round = 0;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.setState(GameState.IDLE);
  }

  /**
   * Inicia uma nova partida. `names` deve ter 1 elemento (SOLO) ou 2 (DUPLA).
   */
  start(names: readonly string[], mode: GameMode): void {
    this.cancelPlayback();
    this.mode = mode;
    this.players = names.map((name) => ({
      name: name.trim().slice(0, 24) || 'Jogador',
      lives: this.config.initialLives,
      score: 0,
      alive: true,
    }));
    this.currentPlayerIndex = 0;
    this.sequence = [];
    this.inputCursor = 0;
    this.round = 0;
    void this.advanceRound();
  }

  private stepDurationForRound(round: number): number {
    const reduced = this.config.initialStepMs - round * this.config.stepDecreasePerRound;
    return Math.max(reduced, this.config.minStepMs);
  }

  /** Adiciona um passo à sequência (compartilhada) e a reproduz. */
  private async advanceRound(): Promise<void> {
    this.sequence.push(randomQuadrant());
    this.inputCursor = 0;
    this.round = this.sequence.length;
    this.emit('round-complete', { round: this.round });
    await this.playSequence();
  }

  private async playSequence(): Promise<void> {
    this.cancelPlayback();
    const controller = new AbortController();
    this.playbackAbort = controller;
    const { signal } = controller;

    this.setState(GameState.PLAYING_SEQUENCE);
    const durationMs = this.stepDurationForRound(this.round);

    try {
      await cancellableDelay(this.config.gapMs * 3, signal);
      for (const quadrant of this.sequence) {
        this.emit('sequence-step', { quadrant, durationMs });
        this.setState(GameState.PLAYING_SEQUENCE, { activeQuadrant: quadrant });
        await cancellableDelay(durationMs, signal);
        this.setState(GameState.PLAYING_SEQUENCE, { activeQuadrant: null });
        await cancellableDelay(this.config.gapMs, signal);
      }
      this.setState(GameState.WAITING_INPUT);
    } catch (err) {
      if (!isAbortError(err)) throw err;
      // Reprodução cancelada (reset/unmount): não propaga estado inconsistente.
    } finally {
      if (this.playbackAbort === controller) {
        this.playbackAbort = null;
      }
    }
  }

  /**
   * Recebe a entrada do jogador da vez, já traduzida em Quadrant.
   * Ignorada fora de WAITING_INPUT — evita cliques fantasmas durante playback.
   */
  submitInput(quadrant: Quadrant): void {
    if (this.state !== GameState.WAITING_INPUT) return;

    const expected = this.sequence[this.inputCursor];
    if (expected === undefined) return; // estado inconsistente: ignora com segurança

    if (quadrant !== expected) {
      this.emit('input-wrong', { quadrant, expected });
      this.handleMistake();
      return;
    }

    this.emit('input-correct', { quadrant });
    this.inputCursor += 1;

    if (this.inputCursor >= this.sequence.length) {
      void this.handleTurnCleared();
      return;
    }
    this.setState(GameState.WAITING_INPUT);
  }

  private currentPlayer(): PlayerState {
    const player = this.players[this.currentPlayerIndex];
    if (!player) throw new Error('GameEngine: nenhum jogador ativo. Chame start() antes de jogar.');
    return player;
  }

  private otherPlayerIndex(): number | null {
    if (this.players.length < 2) return null;
    return this.currentPlayerIndex === 0 ? 1 : 0;
  }

  /** O jogador da vez completou a sequência inteira corretamente. */
  private async handleTurnCleared(): Promise<void> {
    const player = this.currentPlayer();
    player.score = Math.max(player.score, this.round);

    const otherIndex = this.otherPlayerIndex();
    const other = otherIndex !== null ? this.players[otherIndex] : undefined;

    // Só passa a vez na PRIMEIRA metade da rodada (jogador de índice 0):
    // se quem acabou de jogar já é o segundo a jogar nesta rodada (ou o
    // único sobrevivente), a rodada está completa e avança-se de vez.
    if (this.currentPlayerIndex === 0 && other && other.alive && otherIndex !== null) {
      // Passa a vez para o outro jogador repetir a MESMA sequência.
      this.currentPlayerIndex = otherIndex;
      this.inputCursor = 0;
      this.emit('turn-change', { playerIndex: otherIndex });
      this.setState(GameState.PLAYING_SEQUENCE);
      if (!(await this.pause(this.config.gapMs * 4))) return;
      await this.playSequence();
      return;
    }

    // Ambos já jogaram esta rodada (ou só há um jogador vivo): próxima rodada.
    const firstAliveIndex = this.players.findIndex((p) => p.alive);
    this.currentPlayerIndex = firstAliveIndex >= 0 ? firstAliveIndex : 0;
    this.setState(GameState.PLAYING_SEQUENCE);
    if (!(await this.pause(this.config.gapMs * 4))) return;
    await this.advanceRound();
  }

  /** O jogador da vez errou o passo atual. */
  private handleMistake(): void {
    this.cancelPlayback();
    const errorQuadrant = this.sequence[this.inputCursor] ?? null;
    const player = this.currentPlayer();
    player.lives -= 1;

    if (player.lives > 0) {
      this.inputCursor = 0;
      this.setState(GameState.WAITING_INPUT, { errorQuadrant });
      void this.replayAfterMistake();
      return;
    }

    player.alive = false;
    const otherIndex = this.otherPlayerIndex();
    const other = otherIndex !== null ? this.players[otherIndex] : undefined;

    if (other?.alive && otherIndex !== null) {
      // O outro jogador segue sozinho a partir da próxima rodada.
      this.currentPlayerIndex = otherIndex;
      this.setState(GameState.PLAYING_SEQUENCE, { errorQuadrant });
      void this.continueAloneAfterElimination();
      return;
    }

    this.finishGame(errorQuadrant);
  }

  private async replayAfterMistake(): Promise<void> {
    if (!(await this.pause(900))) return;
    await this.playSequence();
  }

  private async continueAloneAfterElimination(): Promise<void> {
    if (!(await this.pause(1400))) return;
    await this.advanceRound();
  }

  /** Espera cancelável reaproveitável entre transições. Retorna false se abortada. */
  private async pause(ms: number): Promise<boolean> {
    const controller = new AbortController();
    this.playbackAbort = controller;
    try {
      await cancellableDelay(ms, controller.signal);
    } catch {
      return false;
    } finally {
      if (this.playbackAbort === controller) {
        this.playbackAbort = null;
      }
    }
    return true;
  }

  private finishGame(errorQuadrant: Quadrant | null): void {
    this.setState(GameState.GAME_OVER, { errorQuadrant });
    const results: PlayerResult[] = this.players.map((p) => ({ name: p.name, score: p.score }));
    this.emit('game-over', { results });
  }

  /** Cleanup total: cancela timers e remove listeners. Chamar no unmount. */
  destroy(): void {
    this.cancelPlayback();
    this.removeAllListeners();
  }
}
