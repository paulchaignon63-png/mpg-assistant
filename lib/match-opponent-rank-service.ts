/**
 * Service rangs adversaires par match - pour pondérer les notes par niveau adversaire
 * Combine les fixtures Sofascore (round → home/away) avec le classement
 */

import { fetchSofascoreStandingsAndFixtures } from "./sofascore-client";
import { getSofascoreMatchResults } from "./sofascore-client";

function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Retourne pour chaque (round, club) le rang de l'adversaire (1 = leader).
 * Map<round, Map<clubNameNorm, opponentRank>>
 */
export async function getRoundToOpponentRankMap(
  championshipId: number | string
): Promise<Map<number, Map<string, number>>> {
  const [standingsData, matchResults] = await Promise.all([
    fetchSofascoreStandingsAndFixtures(championshipId),
    getSofascoreMatchResults(championshipId, 20),
  ]);

  if (!standingsData?.rankByClub || standingsData.rankByClub.size === 0) {
    return new Map();
  }

  const rankByClub = standingsData.rankByClub;
  const result = new Map<number, Map<string, number>>();

  for (const m of matchResults) {
    const round = m.round;
    const homeNorm = normalizeClubName(m.homeTeam);
    const awayNorm = normalizeClubName(m.awayTeam);

    let homeRank: number | undefined = rankByClub.get(awayNorm);
    if (homeRank == null) {
      for (const [k, v] of rankByClub) {
        if (k.includes(awayNorm) || awayNorm.includes(k)) {
          homeRank = v;
          break;
        }
      }
    }

    let awayRank: number | undefined = rankByClub.get(homeNorm);
    if (awayRank == null) {
      for (const [k, v] of rankByClub) {
        if (k.includes(homeNorm) || homeNorm.includes(k)) {
          awayRank = v;
          break;
        }
      }
    }

    if (!result.has(round)) result.set(round, new Map());
    const roundMap = result.get(round)!;
    if (homeRank != null) roundMap.set(homeNorm, homeRank);
    if (awayRank != null) roundMap.set(awayNorm, awayRank);
  }

  return result;
}

/**
 * Trouve le rang adverse pour un club à une journée donnée.
 */
export function getOpponentRankForClubAndRound(
  roundMap: Map<number, Map<string, number>>,
  round: number,
  clubName: string | undefined
): number | undefined {
  if (!clubName?.trim()) return undefined;
  const clubNorm = normalizeClubName(clubName);
  const roundData = roundMap.get(round);
  if (!roundData) return undefined;
  const direct = roundData.get(clubNorm);
  if (direct != null) return direct;
  for (const [key, rank] of roundData) {
    if (key.includes(clubNorm) || clubNorm.includes(key)) return rank;
  }
  return undefined;
}
