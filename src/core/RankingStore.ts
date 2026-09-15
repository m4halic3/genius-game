/**
 * src/core/RankingStore.ts
 * Persistência do placar do kiosk via localStorage. Zero DOM.
 * Cada dispositivo (tablet/notebook) mantém seu próprio placar local —
 * não há backend nesta entrega, então o ranking não é compartilhado
 * entre aparelhos diferentes. Ver nota no README sobre como estender
 * isso para um placar único via API, se o evento precisar disso.
 */

import { GameMode, RankingEntry } from '../types/game';

const STORAGE_KEY = 'genius.ranking.v1';
const MAX_ENTRIES = 50;

function sortEntries(entries: RankingEntry[]): RankingEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.timestamp - b.timestamp);
}

function readRaw(): RankingEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    // localStorage indisponível ou JSON corrompido: placar começa vazio.
    return [];
  }
}

function isValidEntry(value: unknown): value is RankingEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.score === 'number' &&
    typeof candidate.timestamp === 'number' &&
    (candidate.mode === GameMode.SOLO || candidate.mode === GameMode.DUPLA)
  );
}

function writeRaw(entries: RankingEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Falha silenciosa (kiosk em modo privado, quota excedida etc.):
    // o jogo continua funcionando, apenas sem persistir o placar.
  }
}

export class RankingStore {
  /** Retorna o placar completo, ordenado do maior para o menor score. */
  getAll(): RankingEntry[] {
    return sortEntries(readRaw());
  }

  /** Retorna as `n` melhores pontuações (padrão: 3, para o pódio). */
  getTop(n = 3): RankingEntry[] {
    return this.getAll().slice(0, n);
  }

  /**
   * Registra uma pontuação. Pontuações de 0 rodadas não entram no placar
   * (jogador que erra na primeira rodada não "pontua").
   */
  record(name: string, score: number, mode: GameMode): RankingEntry[] {
    if (score <= 0) return this.getAll();

    const entries = readRaw();
    entries.push({
      name: name.trim().slice(0, 24) || 'Jogador',
      score,
      mode,
      timestamp: Date.now(),
    });

    const trimmed = sortEntries(entries).slice(0, MAX_ENTRIES);
    writeRaw(trimmed);
    return trimmed;
  }

  /** Limpa o placar por completo. Exposto para uso administrativo no kiosk. */
  clear(): void {
    writeRaw([]);
  }
}
