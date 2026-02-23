/**
 * Fallback stats joueurs - Transfermarkt + Sofascore
 * Utilisé lorsque MPGStats est indisponible (voir lib/sources-fallback.ts)
 *
 * Sofascore : ratings, titularisations, cartons, assists (lineups + incidents)
 * Transfermarkt : suspensions (sperrenausfaelle) pour isSuspended
 */

import type { MpgStatsEnrichment } from "./mpgstats-client";
import { getSofascorePlayerStats } from "./sofascore-client";
import { scrapeTransfermarktSuspensions } from "./scrapers/sources/transfermarkt";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Récupère les stats joueurs depuis Sofascore (ratings, titularisations, cartons, assists)
 * + Transfermarkt (suspensions) en fallback de MPGStats.
 */
export async function getFallbackPlayerStats(
  championshipId: number | string
): Promise<Map<string, MpgStatsEnrichment>> {
  const result = new Map<string, MpgStatsEnrichment>();

  let sofascoreMap: Awaited<ReturnType<typeof getSofascorePlayerStats>> = new Map();
  let suspendedNames = new Set<string>();

  try {
    sofascoreMap = await getSofascorePlayerStats(championshipId);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fallback-stats] Sofascore failed:", err);
    }
  }

  try {
    const suspensions = await scrapeTransfermarktSuspensions({ championshipId });
    for (const s of suspensions) {
      suspendedNames.add(normalizeName(s.playerName));
    }
  } catch {
    // ignore - Transfermarkt ToS restrictif
  }

  for (const [key, stats] of sofascoreMap) {
    const enrichment: MpgStatsEnrichment = {
      average: stats.average,
      matchs: stats.matchs,
      goals: stats.goals,
    };
    if (stats.assists > 0) enrichment.assists = stats.assists;
    if (stats.pctTitularisations > 0) enrichment.pctTitularisations = stats.pctTitularisations;
    if (stats.yellowCards > 0) enrichment.yellowCards = stats.yellowCards;
    if (stats.redCards > 0) enrichment.redCards = stats.redCards;
    if (suspendedNames.has(key)) enrichment.isSuspended = true;

    result.set(key, enrichment);
  }

  return result;
}
