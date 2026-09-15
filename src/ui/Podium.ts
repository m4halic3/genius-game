/**
 * src/ui/Podium.ts
 * Constrói o DOM do pódio (top 3) e da lista completa do ranking.
 * Função pura de construção — recebe dados prontos, não acessa storage.
 */

import { RankingEntry } from '../types/game';

const PODIUM_ORDER: readonly number[] = [1, 0, 2]; // posições 2º, 1º, 3º (visual clássico)
const PODIUM_HEIGHT_PX: readonly number[] = [88, 128, 68];
const PODIUM_COLOR_CLASS: readonly string[] = ['bg-slate-300', 'bg-amber-400', 'bg-amber-700'];
const PODIUM_RANK_LABEL: readonly string[] = ['2º', '1º', '3º'];

export function buildPodium(top3: readonly RankingEntry[]): HTMLElement {
  const podium = document.createElement('div');
  podium.className = 'flex items-end justify-center gap-3 h-40';

  for (let col = 0; col < 3; col++) {
    const rankIndex = PODIUM_ORDER[col];
    const entry = rankIndex !== undefined ? top3[rankIndex] : undefined;

    const columnWrap = document.createElement('div');
    columnWrap.className = 'flex flex-col items-center gap-1 w-20';

    const name = document.createElement('span');
    name.className = 'text-xs md:text-sm text-slate-200 truncate max-w-[80px]';
    name.textContent = entry ? entry.name : '—';

    const score = document.createElement('span');
    score.className = 'text-[10px] md:text-xs text-slate-400';
    score.textContent = entry ? `${entry.score} pts` : '';

    const bar = document.createElement('div');
    const height = PODIUM_HEIGHT_PX[col] ?? 80;
    bar.className = `w-full rounded-t-lg flex items-start justify-center pt-1 font-bold text-slate-900 ${
      PODIUM_COLOR_CLASS[col] ?? 'bg-slate-400'
    }`;
    bar.style.height = `${height}px`;
    bar.textContent = PODIUM_RANK_LABEL[col] ?? '';

    columnWrap.append(name, score, bar);
    podium.appendChild(columnWrap);
  }

  return podium;
}

export function buildRankingList(entries: readonly RankingEntry[]): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'flex flex-col gap-1 w-full max-w-sm text-sm md:text-base max-h-64 overflow-y-auto';

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'text-slate-500 text-center py-4';
    empty.textContent = 'Nenhuma pontuação registrada ainda.';
    list.appendChild(empty);
    return list;
  }

  entries.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'flex justify-between px-3 py-1.5 rounded-lg odd:bg-white/5';
    const rank = document.createElement('span');
    rank.className = 'text-slate-400 w-8';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'flex-1 truncate';
    name.textContent = entry.name;
    const score = document.createElement('span');
    score.className = 'text-slate-300 tabular-nums';
    score.textContent = `${entry.score} pts`;
    li.append(rank, name, score);
    list.appendChild(li);
  });

  return list;
}
