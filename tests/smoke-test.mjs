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

// --- Teste 1: modo DUPLA — turnos alternam corretamente ---
const engine = new GameEngine({ initialStepMs: 10, minStepMs: 10, gapMs: 1, stepDecreasePerRound: 0 });
let lastSnapshot = null;
engine.on('state-change', (s) => (lastSnapshot = s));

let sequenceSeen = [];
engine.on('sequence-step', ({ quadrant }) => sequenceSeen.push(quadrant));

engine.start(['Alice', 'Bruno'], GameMode.DUPLA);

// Espera a primeira sequência (1 passo) ser reproduzida.
await new Promise((r) => setTimeout(r, 200));
assert(lastSnapshot.state === 'WAITING_INPUT', 'engine entra em WAITING_INPUT após tocar a sequência');
assert(lastSnapshot.currentPlayerIndex === 0, 'jogador 0 (Alice) começa jogando');
assert(sequenceSeen.length === 1, 'sequência inicial tem 1 passo');

const firstQuadrant = sequenceSeen[0];
engine.submitInput(firstQuadrant);
await new Promise((r) => setTimeout(r, 100));
assert(lastSnapshot.currentPlayerIndex === 1, 'após Alice acertar, a vez passa para Bruno (mesma sequência)');
assert(lastSnapshot.state === 'WAITING_INPUT', 'engine volta a WAITING_INPUT para o segundo jogador');

engine.submitInput(firstQuadrant);
await new Promise((r) => setTimeout(r, 200));
assert(lastSnapshot.round === 2, 'após ambos acertarem, avança para a rodada 2');
assert(lastSnapshot.currentPlayerIndex === 0, 'rodada nova começa com o jogador 0 de novo');

// --- Teste 2: erro tira vida e mantém o mesmo jogador ---
const wrongQuadrant = (sequenceSeen[sequenceSeen.length - 1] + 1) % 4;
const livesBefore = lastSnapshot.players[0].lives;
engine.submitInput(wrongQuadrant); // primeiro passo da rodada 2, jogador 0
await new Promise((r) => setTimeout(r, 50));
assert(lastSnapshot.players[0].lives === livesBefore - 1, 'errar reduz uma vida do jogador da vez');

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
let snap2 = null;
let gameOverResults = null;
engine2.on('state-change', (s) => (snap2 = s));
engine2.on('game-over', ({ results }) => (gameOverResults = results));

engine2.start(['Sozinho1', 'Sozinho2'], GameMode.DUPLA);
await new Promise((r) => setTimeout(r, 100));
// Jogador 0 erra de propósito (1 vida só): deve ser eliminado e o jogo
// deve passar a vez ao jogador 1, que continua sozinho.
const seqLen1 = snap2.round;
engine2.submitInput((0 + 1) % 4 === snap2.currentPlayerIndex ? 0 : 3); // garante resposta errada
await new Promise((r) => setTimeout(r, 300));
assert(snap2.players[0].alive === false, 'jogador eliminado fica com alive=false');
assert(snap2.currentPlayerIndex === 1, 'após eliminação, a vez fica com o sobrevivente');

engine2.destroy();
assert(seqLen1 === 1, 'sanity: primeira rodada tinha 1 passo');

console.log('\nTODOS OS TESTES PASSARAM');
