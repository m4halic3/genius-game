/**
 * src/ui/App.ts
 * Componente principal (kiosk). Única camada que toca DOM.
 * Orquestra as telas: Instruções -> Configuração (modo + nomes) -> Partida
 * -> Fim de jogo -> Ranking. Consome GameEngine via eventos, persiste
 * pontuações via RankingStore e toca som via AudioSynth.
 */

import { AudioSynth } from '../core/AudioSynth';
import { GameEngine } from '../core/GameEngine';
import { RankingStore } from '../core/RankingStore';
import {
  GameMode,
  GameSnapshot,
  KEY_TO_QUADRANT,
  PlayerResult,
  Quadrant,
  RankingEntry,
} from '../types/game';
import { buildInstructions } from './InstructionsOverlay';
import { buildPodium, buildRankingList } from './Podium';

enum UiScreen {
  INSTRUCTIONS = 'INSTRUCTIONS',
  SETUP = 'SETUP',
  PLAYING = 'PLAYING',
  RANKING = 'RANKING',
}

const QUADRANT_ORDER: readonly Quadrant[] = [Quadrant.GREEN, Quadrant.RED, Quadrant.YELLOW, Quadrant.BLUE];

const QUADRANT_BASE_CLASS: Readonly<Record<Quadrant, string>> = {
  [Quadrant.GREEN]: 'bg-emerald-600',
  [Quadrant.RED]: 'bg-rose-600',
  [Quadrant.YELLOW]: 'bg-amber-500',
  [Quadrant.BLUE]: 'bg-blue-600',
};

const QUADRANT_ACTIVE_CLASS: Readonly<Record<Quadrant, string>> = {
  [Quadrant.GREEN]: 'bg-emerald-300',
  [Quadrant.RED]: 'bg-rose-300',
  [Quadrant.YELLOW]: 'bg-amber-200',
  [Quadrant.BLUE]: 'bg-blue-300',
};

const ERROR_CLASS = 'bg-red-900 ring-4 ring-red-300';

const DEFAULT_NAMES: Readonly<Record<GameMode, string[]>> = {
  [GameMode.SOLO]: ['Jogador 1'],
  [GameMode.DUPLA]: ['Jogador 1', 'Jogador 2'],
};

function heartsLabel(lives: number): string {
  return lives > 0 ? '♥'.repeat(lives) : '—';
}

/** App encapsula todo o ciclo de vida da UI. Uma instância por sessão de kiosk. */
export class App {
  private readonly root: HTMLElement;
  private readonly engine: GameEngine;
  private readonly audio: AudioSynth;
  private readonly ranking: RankingStore;

  private readonly globalAbort = new AbortController();
  private screenAbort = new AbortController();
  private playingUnsubs: Array<() => void> = [];

  private uiScreen: UiScreen = UiScreen.INSTRUCTIONS;
  private selectedMode: GameMode = GameMode.SOLO;

  private topBar!: HTMLElement;
  private content!: HTMLElement;
  private muteButton!: HTMLButtonElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.engine = new GameEngine();
    this.audio = AudioSynth.getInstance();
    this.ranking = new RankingStore();

    this.mountShell();
    this.bindGlobalInput();
    this.goToInstructions();
  }

  // ---------------------------------------------------------------------
  // Casca fixa (top bar + área de conteúdo trocável)
  // ---------------------------------------------------------------------

  private mountShell(): void {
    this.root.innerHTML = '';
    this.root.className = 'fixed inset-0 overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none touch-none';

    this.topBar = document.createElement('div');
    this.topBar.className = 'flex-none flex items-center justify-between px-4 py-2 md:px-6 md:py-3';

    const title = document.createElement('span');
    title.className = 'font-bold tracking-wide text-lg md:text-xl';
    title.textContent = 'GENIUS';

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2';

    this.muteButton = document.createElement('button');
    this.muteButton.type = 'button';
    this.muteButton.className = 'px-3 py-1.5 rounded-full bg-slate-800/80 text-xs md:text-sm hover:bg-slate-700 transition';
    this.muteButton.textContent = 'Som: ligado';

    actions.append(this.muteButton);
    this.topBar.append(title, actions);

    this.content = document.createElement('div');
    this.content.className = 'flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden px-4';

    this.root.append(this.topBar, this.content);
  }

  private setTopBarActions(buttons: HTMLElement[]): void {
    const actions = this.topBar.lastElementChild as HTMLElement;
    actions.innerHTML = '';
    actions.append(this.muteButton, ...buttons);
  }

  private makeTopBarButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-3 py-1.5 rounded-full bg-slate-800/80 text-xs md:text-sm hover:bg-slate-700 transition';
    btn.textContent = label;
    btn.addEventListener('click', onClick, { signal: this.globalAbort.signal });
    return btn;
  }

  /** Troca de tela: cancela listeners específicos da tela anterior. */
  private beginScreen(next: UiScreen): void {
    this.screenAbort.abort();
    this.screenAbort = new AbortController();
    this.uiScreen = next;
    this.content.innerHTML = '';
  }

  // ---------------------------------------------------------------------
  // Tela: Instruções
  // ---------------------------------------------------------------------

  private goToInstructions(): void {
    this.beginScreen(UiScreen.INSTRUCTIONS);
    this.setTopBarActions([this.makeTopBarButton('Ranking', () => this.goToRanking())]);

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-6 overflow-y-auto max-h-full py-4';
    wrap.appendChild(buildInstructions());

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className =
      'px-8 py-3 rounded-full bg-white text-slate-900 font-semibold text-lg hover:bg-slate-200 active:scale-95 transition';
    continueBtn.textContent = 'Continuar';
    continueBtn.addEventListener('click', () => this.goToSetup(), { signal: this.screenAbort.signal });

    wrap.appendChild(continueBtn);
    this.content.appendChild(wrap);
  }

  // ---------------------------------------------------------------------
  // Tela: Configuração (modo + nomes)
  // ---------------------------------------------------------------------

  private goToSetup(): void {
    this.beginScreen(UiScreen.SETUP);
    this.setTopBarActions([
      this.makeTopBarButton('Como jogar', () => this.goToInstructions()),
      this.makeTopBarButton('Ranking', () => this.goToRanking()),
    ]);

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-6 w-full max-w-sm';

    const title = document.createElement('h2');
    title.className = 'text-2xl md:text-3xl font-bold';
    title.textContent = 'Escolha o modo';
    wrap.appendChild(title);

    const modeRow = document.createElement('div');
    modeRow.className = 'grid grid-cols-2 gap-3 w-full';

    const nameFieldsWrap = document.createElement('div');
    nameFieldsWrap.className = 'flex flex-col gap-3 w-full';

    const inputs: HTMLInputElement[] = [];

    const renderNameFields = (mode: GameMode): void => {
      nameFieldsWrap.innerHTML = '';
      inputs.length = 0;
      DEFAULT_NAMES[mode].forEach((placeholder, i) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 24;
        input.placeholder = placeholder;
        input.value = placeholder;
        input.className =
          'w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-white/40';
        input.setAttribute('aria-label', `Nome do jogador ${i + 1}`);
        inputs.push(input);
        nameFieldsWrap.appendChild(input);
      });
    };

    const modeButton = (mode: GameMode, label: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = this.selectedMode === mode;
      btn.className = `px-4 py-3 rounded-xl font-semibold border-2 transition ${
        isSelected ? 'bg-white text-slate-900 border-white' : 'bg-slate-800 border-slate-700 text-slate-200'
      }`;
      btn.textContent = label;
      btn.addEventListener(
        'click',
        () => {
          this.selectedMode = mode;
          for (const child of Array.from(modeRow.children)) {
            child.className =
              'px-4 py-3 rounded-xl font-semibold border-2 transition bg-slate-800 border-slate-700 text-slate-200';
          }
          btn.className = 'px-4 py-3 rounded-xl font-semibold border-2 transition bg-white text-slate-900 border-white';
          renderNameFields(mode);
        },
        { signal: this.screenAbort.signal },
      );
      return btn;
    };

    modeRow.append(modeButton(GameMode.SOLO, 'Solo'), modeButton(GameMode.DUPLA, 'Dupla'));
    renderNameFields(this.selectedMode);

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className =
      'w-full px-8 py-3 rounded-full bg-emerald-500 text-slate-950 font-semibold text-lg hover:bg-emerald-400 active:scale-95 transition';
    startButton.textContent = 'Iniciar';
    startButton.addEventListener(
      'click',
      () => {
        void this.audio.unlock();
        const names = inputs.map((input) => input.value);
        this.goToPlaying(names, this.selectedMode);
      },
      { signal: this.screenAbort.signal },
    );

    wrap.append(modeRow, nameFieldsWrap, startButton);
    this.content.appendChild(wrap);
  }

  // ---------------------------------------------------------------------
  // Tela: Partida
  // ---------------------------------------------------------------------

  private goToPlaying(names: readonly string[], mode: GameMode): void {
    this.beginScreen(UiScreen.PLAYING);
    this.setTopBarActions([this.makeTopBarButton('Reiniciar', () => this.abandonAndGoToSetup())]);

    for (const unsub of this.playingUnsubs) unsub();
    this.playingUnsubs = [];

    const wrap = document.createElement('div');
    wrap.className = 'relative flex flex-col items-center gap-4 w-full h-full justify-center';

    const hud = this.buildHud(mode, names.length);
    const board = this.buildBoard();
    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'hidden absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 backdrop-blur-sm px-6';

    wrap.append(hud.el, board.el, gameOverOverlay);
    this.content.appendChild(wrap);

    const applySnapshot = (snapshot: GameSnapshot): void => {
      hud.update(snapshot);
      board.update(snapshot);
    };

    this.playingUnsubs.push(
      this.engine.on('state-change', applySnapshot),
      this.engine.on('sequence-step', ({ quadrant, durationMs }) => this.audio.playQuadrant(quadrant, durationMs)),
      this.engine.on('input-correct', ({ quadrant }) => this.audio.playQuadrant(quadrant, 180)),
      this.engine.on('input-wrong', () => this.audio.playError()),
      this.engine.on('game-over', ({ results }) => {
        this.recordResults(results, mode);
        this.showGameOverOverlay(gameOverOverlay, results, mode);
      }),
    );

    for (const [quadrant, el] of board.elements) {
      el.addEventListener(
        'pointerdown',
        (ev) => {
          ev.preventDefault();
          this.engine.submitInput(quadrant);
        },
        { signal: this.screenAbort.signal },
      );
    }

    this.engine.start(names, mode);
  }

  private buildHud(mode: GameMode, playerCount: number): {
    el: HTMLElement;
    update: (snapshot: GameSnapshot) => void;
  } {
    const el = document.createElement('div');
    el.className = 'flex flex-col items-center gap-2 w-full max-w-md';

    const roundLine = document.createElement('div');
    roundLine.className = 'text-sm md:text-base text-slate-400';

    const playersRow = document.createElement('div');
    playersRow.className = 'flex gap-3 w-full justify-center flex-wrap';

    const playerCards: HTMLElement[] = [];
    for (let i = 0; i < playerCount; i++) {
      const card = document.createElement('div');
      card.className = 'flex flex-col items-center px-4 py-2 rounded-xl bg-slate-800/70 min-w-[110px] transition';
      playerCards.push(card);
      playersRow.appendChild(card);
    }

    el.append(roundLine, playersRow);

    const update = (snapshot: GameSnapshot): void => {
      roundLine.textContent = `Rodada ${snapshot.round}`;
      snapshot.players.forEach((player, i) => {
        const card = playerCards[i];
        if (!card) return;
        const isTurn = mode === GameMode.DUPLA && i === snapshot.currentPlayerIndex && player.alive;
        card.className = `flex flex-col items-center px-4 py-2 rounded-xl min-w-[110px] transition ${
          isTurn ? 'bg-white text-slate-900' : player.alive ? 'bg-slate-800/70' : 'bg-slate-900/60 opacity-50'
        }`;
        card.innerHTML = '';
        const name = document.createElement('span');
        name.className = 'text-sm font-semibold truncate max-w-[100px]';
        name.textContent = player.name;
        const lives = document.createElement('span');
        lives.className = 'text-xs';
        lives.textContent = heartsLabel(player.lives);
        const score = document.createElement('span');
        score.className = 'text-[10px] opacity-70';
        score.textContent = `${player.score} pts`;
        card.append(name, lives, score);
      });
    };

    return { el, update };
  }

  private buildBoard(): {
    el: HTMLElement;
    elements: Map<Quadrant, HTMLButtonElement>;
    update: (snapshot: GameSnapshot) => void;
  } {
    const el = document.createElement('div');
    el.className = 'grid grid-cols-2 gap-3 md:gap-4 w-[min(80vw,60vh)] h-[min(80vw,60vh)] max-w-[560px] max-h-[560px]';

    const elements = new Map<Quadrant, HTMLButtonElement>();
    for (const quadrant of QUADRANT_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `${QUADRANT_BASE_CLASS[quadrant]} rounded-2xl transition-colors duration-75 active:scale-[0.98]`;
      btn.style.touchAction = 'none';
      elements.set(quadrant, btn);
      el.appendChild(btn);
    }

    const update = (snapshot: GameSnapshot): void => {
      for (const [quadrant, btn] of elements) {
        const isActive = snapshot.activeQuadrant === quadrant;
        const isError = snapshot.errorQuadrant === quadrant;
        btn.className = `${
          isError ? ERROR_CLASS : isActive ? QUADRANT_ACTIVE_CLASS[quadrant] : QUADRANT_BASE_CLASS[quadrant]
        } rounded-2xl transition-colors duration-75 active:scale-[0.98]`;
        btn.style.touchAction = 'none';
      }
    };

    return { el, elements, update };
  }

  private showGameOverOverlay(overlay: HTMLElement, results: readonly PlayerResult[], mode: GameMode): void {
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const title = document.createElement('h2');
    title.className = 'text-3xl md:text-4xl font-bold';
    title.textContent = 'Fim de jogo';

    const resultsList = document.createElement('div');
    resultsList.className = 'flex flex-col items-center gap-1';
    const winner = mode === GameMode.DUPLA ? [...results].sort((a, b) => b.score - a.score)[0] : null;
    for (const result of results) {
      const line = document.createElement('p');
      const isWinner = winner && result.name === winner.name && results.length > 1 && winner.score > 0;
      line.className = `text-lg ${isWinner ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`;
      line.textContent = `${result.name}: rodada ${result.score}${isWinner ? ' 🏆' : ''}`;
      resultsList.appendChild(line);
    }

    const actions = document.createElement('div');
    actions.className = 'flex gap-3 mt-2';

    const againBtn = document.createElement('button');
    againBtn.type = 'button';
    againBtn.className =
      'px-6 py-2.5 rounded-full bg-white text-slate-900 font-semibold hover:bg-slate-200 active:scale-95 transition';
    againBtn.textContent = 'Jogar novamente';
    againBtn.addEventListener('click', () => this.goToSetup(), { signal: this.screenAbort.signal });

    const rankingBtn = document.createElement('button');
    rankingBtn.type = 'button';
    rankingBtn.className =
      'px-6 py-2.5 rounded-full bg-slate-800 text-slate-100 font-semibold hover:bg-slate-700 active:scale-95 transition';
    rankingBtn.textContent = 'Ver ranking';
    rankingBtn.addEventListener('click', () => this.goToRanking(), { signal: this.screenAbort.signal });

    actions.append(againBtn, rankingBtn);
    overlay.append(title, resultsList, actions);
  }

  private recordResults(results: readonly PlayerResult[], mode: GameMode): void {
    for (const result of results) {
      this.ranking.record(result.name, result.score, mode);
    }
  }

  private abandonAndGoToSetup(): void {
    this.engine.reset();
    this.goToSetup();
  }

  // ---------------------------------------------------------------------
  // Tela: Ranking
  // ---------------------------------------------------------------------

  private goToRanking(): void {
    this.beginScreen(UiScreen.RANKING);
    this.setTopBarActions([this.makeTopBarButton('Voltar', () => this.goToSetup())]);

    const entries: RankingEntry[] = this.ranking.getAll();

    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-4 w-full max-w-sm overflow-y-auto max-h-full py-2';

    const title = document.createElement('h2');
    title.className = 'text-2xl md:text-3xl font-bold';
    title.textContent = 'Ranking';

    wrap.append(title, buildPodium(this.ranking.getTop(3)), buildRankingList(entries));
    this.content.appendChild(wrap);
  }

  // ---------------------------------------------------------------------
  // Entrada global (teclado) + cleanup
  // ---------------------------------------------------------------------

  private bindGlobalInput(): void {
    const { signal } = this.globalAbort;

    this.muteButton.addEventListener(
      'click',
      () => {
        const nextMuted = !this.audio.isMuted();
        this.audio.setMuted(nextMuted);
        this.muteButton.textContent = nextMuted ? 'Som: mudo' : 'Som: ligado';
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (ev) => {
        if (this.uiScreen !== UiScreen.PLAYING) return;
        const quadrant = KEY_TO_QUADRANT[ev.code];
        if (quadrant === undefined) return;
        ev.preventDefault();
        void this.audio.unlock();
        this.engine.submitInput(quadrant);
      },
      { signal },
    );

    // Evita o menu de contexto/seleção em toque longo — essencial em kiosk.
    window.addEventListener('contextmenu', (ev) => ev.preventDefault(), { signal });
  }

  /** Cleanup total: engine, listeners de DOM e window. Chamar antes de descartar a instância. */
  destroy(): void {
    this.globalAbort.abort();
    this.screenAbort.abort();
    for (const unsub of this.playingUnsubs) unsub();
    this.playingUnsubs = [];
    this.engine.destroy();
    this.audio.stopAll();
    this.root.innerHTML = '';
  }
}
