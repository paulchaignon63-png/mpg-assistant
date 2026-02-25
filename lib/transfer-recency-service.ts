/**
 * Service transfert récent - identifie les joueurs transférés récemment
 * Utilisé pour appliquer un malus dans le score de recommandation
 */

import type { ScrapedTransfer } from "@/types/scraped";

const TRANSFER_RECENCY_DAYS = 21;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTransferDate(dateStr: string | undefined): number | null {
  if (!dateStr?.trim()) return null;
  const parsed = Date.parse(dateStr.replace(/(\d{2})[\/.](\d{2})[\/.](\d{2,4})/, (_, d, m, y) => {
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m}-${d}`;
  }));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Retourne un Set des noms normalisés des joueurs transférés dans les N derniers jours.
 */
export function getTransferredRecentlyPlayerNames(
  transfers: ScrapedTransfer[],
  withinDays = TRANSFER_RECENCY_DAYS
): Set<string> {
  const result = new Set<string>();
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;

  for (const t of transfers) {
    const ts = parseTransferDate(t.date);
    if (ts == null || ts < cutoff) continue;
    if (t.playerName?.trim()) {
      result.add(normalizeName(t.playerName));
    }
  }

  return result;
}
