/**
 * src/ui/InstructionsOverlay.ts
 * Bloco de instruções rápidas: passo a passo curto + legenda de teclas
 * (para quem estiver jogando no notebook em vez do tablet touch).
 * Função pura de construção de DOM — sem estado próprio.
 */

import { Quadrant, QUADRANT_KEY_LABEL, QUADRANT_LABEL } from '../types/game';

const QUADRANT_DOT_CLASS: Readonly<Record<Quadrant, string>> = {
  [Quadrant.GREEN]: 'bg-emerald-500',
  [Quadrant.RED]: 'bg-rose-500',
  [Quadrant.YELLOW]: 'bg-amber-400',
  [Quadrant.BLUE]: 'bg-blue-500',
};

const STEPS: readonly string[] = [
  'Escolha Solo (1 jogador) ou Dupla (2 jogadores, no mesmo aparelho).',
  'Observe a sequência de cores que acende e toca no tabuleiro.',
  'Repita a sequência tocando os quadrantes na mesma ordem.',
  'A cada acerto a sequência cresce; errar tira uma vida. Sem vidas, fim de jogo.',
];

export function buildInstructions(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center gap-5 max-w-lg w-full px-6 text-center';

  const title = document.createElement('h2');
  title.className = 'text-2xl md:text-3xl font-bold';
  title.textContent = 'Como jogar';
  wrap.appendChild(title);

  const list = document.createElement('ol');
  list.className = 'flex flex-col gap-2 text-left text-sm md:text-base text-slate-200 w-full';
  STEPS.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'flex gap-3';
    const num = document.createElement('span');
    num.className =
      'flex-none w-6 h-6 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center justify-center';
    num.textContent = String(i + 1);
    const text = document.createElement('span');
    text.textContent = step;
    li.append(num, text);
    list.appendChild(li);
  });
  wrap.appendChild(list);

  const keyLegendTitle = document.createElement('p');
  keyLegendTitle.className = 'text-xs md:text-sm text-slate-400 mt-1';
  keyLegendTitle.textContent = 'Jogando no computador? Use o teclado:';
  wrap.appendChild(keyLegendTitle);

  const legend = document.createElement('div');
  legend.className = 'grid grid-cols-2 gap-2 w-full';
  for (const quadrant of [Quadrant.GREEN, Quadrant.RED, Quadrant.YELLOW, Quadrant.BLUE]) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm';
    const dot = document.createElement('span');
    dot.className = `w-3 h-3 rounded-full ${QUADRANT_DOT_CLASS[quadrant]}`;
    const label = document.createElement('span');
    label.className = 'text-slate-200';
    label.textContent = QUADRANT_LABEL[quadrant];
    const key = document.createElement('span');
    key.className = 'ml-auto font-mono text-slate-400';
    key.textContent = QUADRANT_KEY_LABEL[quadrant];
    row.append(dot, label, key);
    legend.appendChild(row);
  }
  wrap.appendChild(legend);

  const touchNote = document.createElement('p');
  touchNote.className = 'text-xs text-slate-500';
  touchNote.textContent = 'No tablet, basta tocar diretamente no quadrante colorido.';
  wrap.appendChild(touchNote);

  return wrap;
}
