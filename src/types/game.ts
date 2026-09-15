/**
 * src/types/game.ts
 * Tipos, enums e constantes de domínio. Zero dependência de DOM ou runtime.
 */

/** Máquina de estados finita do jogo (nível de partida em andamento). */
export enum GameState {
  IDLE = 'IDLE',
  PLAYING_SEQUENCE = 'PLAYING_SEQUENCE',
  WAITING_INPUT = 'WAITING_INPUT',
  GAME_OVER = 'GAME_OVER',
}

/** Modo de jogo: um jogador ou dois alternando turnos na mesma sequência. */
export enum GameMode {
  SOLO = 'SOLO',
  DUPLA = 'DUPLA',
}

/** Os quatro quadrantes do tabuleiro. Valor numérico usado como índice O(1). */
export enum Quadrant {
  GREEN = 0,
  RED = 1,
  YELLOW = 2,
  BLUE = 3,
}

export const QUADRANT_COUNT = 4;

/** Mapeamento tecla física -> quadrante lógico (teclado + setas). */
export const KEY_TO_QUADRANT: Readonly<Record<string, Quadrant>> = {
  KeyQ: Quadrant.GREEN,
  ArrowUp: Quadrant.GREEN,
  KeyW: Quadrant.RED,
  ArrowRight: Quadrant.RED,
  KeyA: Quadrant.YELLOW,
  ArrowLeft: Quadrant.YELLOW,
  KeyS: Quadrant.BLUE,
  ArrowDown: Quadrant.BLUE,
};

/** Rótulo curto de cada quadrante, para legendas de UI (tutorial, HUD). */
export const QUADRANT_LABEL: Readonly<Record<Quadrant, string>> = {
  [Quadrant.GREEN]: 'Verde',
  [Quadrant.RED]: 'Vermelho',
  [Quadrant.YELLOW]: 'Amarelo',
  [Quadrant.BLUE]: 'Azul',
};

/** Tecla de exibição (a principal) de cada quadrante, para legendas de UI. */
export const QUADRANT_KEY_LABEL: Readonly<Record<Quadrant, string>> = {
  [Quadrant.GREEN]: 'Q / ↑',
  [Quadrant.RED]: 'W / →',
  [Quadrant.YELLOW]: 'A / ←',
  [Quadrant.BLUE]: 'S / ↓',
};

/** Frequência (Hz) associada a cada quadrante, para o AudioSynth. */
export const QUADRANT_FREQUENCY: Readonly<Record<Quadrant, number>> = {
  [Quadrant.GREEN]: 329.63,
  [Quadrant.RED]: 261.63,
  [Quadrant.YELLOW]: 220.0,
  [Quadrant.BLUE]: 164.81,
};

/** Configuração de dificuldade / timing do engine. */
export interface GameConfig {
  /** Duração inicial de cada nota da sequência, em ms. */
  initialStepMs: number;
  /** Duração mínima de cada nota (piso de velocidade), em ms. */
  minStepMs: number;
  /** Redução de duração por rodada, em ms. */
  stepDecreasePerRound: number;
  /** Intervalo entre o apagar de uma nota e o acender da próxima, em ms. */
  gapMs: number;
  /** Vidas iniciais de cada jogador. */
  initialLives: number;
}

export const DEFAULT_CONFIG: Readonly<GameConfig> = {
  initialStepMs: 700,
  minStepMs: 260,
  stepDecreasePerRound: 18,
  gapMs: 140,
  initialLives: 3,
};

/** Estado individual de um jogador dentro de uma partida. */
export interface PlayerState {
  name: string;
  lives: number;
  /** Maior rodada validada por este jogador. */
  score: number;
  /** Falso quando o jogador esgotou as vidas; sai da rotação de turnos. */
  alive: boolean;
}

/** Resultado final de um jogador ao término da partida, para a UI/ranking. */
export interface PlayerResult {
  name: string;
  score: number;
}

/** Snapshot imutável do estado da partida, emitido a cada mudança relevante. */
export interface GameSnapshot {
  state: GameState;
  mode: GameMode;
  round: number;
  players: readonly PlayerState[];
  /** Índice do jogador cuja vez é agora, em `players`. */
  currentPlayerIndex: number;
  /** Índice do quadrante que deve estar aceso agora (ou null). Usado pela UI. */
  activeQuadrant: Quadrant | null;
  /** Índice do quadrante em que o jogador errou nesta rodada (ou null). */
  errorQuadrant: Quadrant | null;
}

/** Eventos emitidos pelo GameEngine, consumidos pela camada de UI/Audio. */
export type GameEventMap = {
  'state-change': GameSnapshot;
  /** Disparado no exato instante em que um quadrante deve tocar/acender. */
  'sequence-step': { quadrant: Quadrant; durationMs: number };
  /** Disparado quando o jogador acerta um passo. */
  'input-correct': { quadrant: Quadrant };
  /** Disparado quando o jogador erra. */
  'input-wrong': { quadrant: Quadrant; expected: Quadrant };
  'round-complete': { round: number };
  /** Disparado ao trocar a vez, no modo DUPLA. */
  'turn-change': { playerIndex: number };
  /** Disparado quando a partida termina, com o resultado final de cada jogador. */
  'game-over': { results: readonly PlayerResult[] };
};

export type GameEventName = keyof GameEventMap;
export type GameEventListener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/** Uma entrada persistida no placar (ranking) do kiosk. */
export interface RankingEntry {
  name: string;
  score: number;
  mode: GameMode;
  /** Epoch ms — usado apenas para desempate/ordenação estável, não exibido. */
  timestamp: number;
}
