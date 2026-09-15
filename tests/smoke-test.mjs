import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.DOMException = dom.window.DOMException;
global.localStorage = dom.window.localStorage;

// jsdom não implementa Web Audio; simulamos ausência total (o AudioSynth já
// trata isso de forma defensiva) e checamos que nada quebra.

const { GameEngine } = await import('../src/core/GameEngine.ts');
const { RankingStore } = await import('../src/core/RankingStore.ts');
const { GameMode } = await import('../src/types/game.ts');

function assert(cond, msg) {
  if (!cond) throw new Error('FALHA: ' + msg);
  console.log('OK:', msg);
}

/**
 * Escuta o engine e mantém, a cada turno, a sequência completa que acabou
 * de ser reproduzida para o jogador da vez (reset a cada 'round-complete').
 */
function trackTurns(engine) {
  let lastSnapshot = null;
  let currentTurnQuadrants = [];
  const perPlayerSequences = [[], []];

  engine.on('state-change', (s) => (lastSnapshot = s));
  engine.on('round-complete', ({ playerIndex }) => {
    currentTurnQuadrants = [];
    perPlayerSequences[playerIndex] = [];
  });
  engine.on('sequence-step', ({ quadrant }) => {
    currentTurnQuadrants.push(quadrant);
    if (lastSnapshot) perPlayerSequences[lastSnapshot.currentPlayerIndex].push(quadrant);
  });

  return {
    get snapshot() {
      return lastSnapshot;
    },
    get currentTurnQuadrants() {
      return currentTurnQuadrants;
    },
    get perPlayerSequences() {
      return perPlayerSequences;
    },
  };
}

// --- Teste 1: modo DUPLA — cada jogador cresce a PRÓPRIA sequência ---
const engine = new GameEngine({ initialStepMs: 10, minStepMs: 10, gapMs: 1, stepDecreasePerRound: 0 });
const t = trackTurns(engine);

engine.start(['Alice', 'Bruno'], GameMode.DUPLA);

// Turno 1: Alice (sequência própria, 1 passo).
await new Promise((r) => setTimeout(r, 200));
assert(t.snapshot.state === 'WAITING_INPUT', 'engine entra em WAITING_INPUT após tocar a sequência');
assert(t.snapshot.currentPlayerIndex === 0, 'jogador 0 (Alice) começa jogando');
assert(t.snapshot.round === 1, 'primeiro turno de Alice tem sequência de tamanho 1');
const aliceTurn1 = [...t.currentTurnQuadrants];
assert(aliceTurn1.length === 1, 'sequência do turno 1 de Alice foi capturada com 1 passo');

for (const q of aliceTurn1) engine.submitInput(q);
await new Promise((r) => setTimeout(r, 100));
assert(t.snapshot.currentPlayerIndex === 1, 'após Alice acertar, a vez passa para Bruno');
assert(t.snapshot.round === 1, 'primeiro turno de Bruno também começa com sequência de tamanho 1 (própria, não herdada)');
const brunoTurn1 = [...t.currentTurnQuadrants];
assert(brunoTurn1.length === 1, 'sequência do turno 1 de Bruno foi capturada com 1 passo');

for (const q of brunoTurn1) engine.submitInput(q);
await new Promise((r) => setTimeout(r, 100));
assert(t.snapshot.currentPlayerIndex === 0, 'a vez volta para Alice no turno seguinte');
assert(t.snapshot.round === 2, 'segunda sequência de Alice cresce para tamanho 2 (a dela, isoladamente)');
assert(
  t.perPlayerSequences[0].length === 2 && t.perPlayerSequences[1].length === 1,
  'Alice já está na rodada 2 (2 passos) enquanto Bruno ainda está na rodada 1 (1 passo): sequências crescem de forma independente, não em lockstep compartilhado',
);

// --- Teste 2: errar reduz vida do jogador da vez, sem afetar o outro ---
const aliceTurn2 = [...t.currentTurnQuadrants];
const wrongQuadrant = (aliceTurn2[0] + 1) % 4;
const aliceLivesBefore = t.snapshot.players[0].lives;
const brunoLivesBefore = t.snapshot.players[1].lives;
engine.submitInput(wrongQuadrant);
await new Promise((r) => setTimeout(r, 50));
assert(t.snapshot.players[0].lives === aliceLivesBefore - 1, 'errar reduz uma vida do jogador da vez (Alice)');
assert(t.snapshot.players[1].lives === brunoLivesBefore, 'a vida de Bruno não é afetada pelo erro de Alice');

engine.destroy();

// --- Teste 3: RankingStore persiste e ordena ---
const ranking = new RankingStore();
ranking.clear();
ranking.record('Carlos', 5, GameMode.SOLO);
ranking.record('Ana', 9, GameMode.SOLO);
ranking.record('Zero pontos', 0, GameMode.SOLO); // não deve entrar
const all = ranking.getAll();
assert(all.length === 2, 'pontuação 0 não é registrada no ranking');
assert(all[0].name === 'Ana' && all[0].score === 9, 'ranking ordenado do maior para o menor score');

// --- Teste 4: eliminação — jogador some, o outro continua sozinho ---
const engine2 = new GameEngine({ initialStepMs: 5, minStepMs: 5, gapMs: 1, stepDecreasePerRound: 0, initialLives: 1 });
const t2 = trackTurns(engine2);

engine2.start(['Sozinho1', 'Sozinho2'], GameMode.DUPLA);
await new Promise((r) => setTimeout(r, 100));
const expectedFirst = t2.currentTurnQuadrants[0];
engine2.submitInput((expectedFirst + 1) % 4); // erro proposital: única vida, deve eliminar
await new Promise((r) => setTimeout(r, 300));
assert(t2.snapshot.players[0].alive === false, 'jogador eliminado fica com alive=false');
assert(t2.snapshot.currentPlayerIndex === 1, 'após eliminação, a vez fica com o sobrevivente');

engine2.destroy();

console.log('\nTODOS OS TESTES PASSARAM');

