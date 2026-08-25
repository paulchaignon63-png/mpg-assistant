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

export interface RoundContext {
  /** Map<round, Map<clubNameNorm, opponentRank>> — rang de l'adversaire. */
  rankByRound: Map<number, Map<string, number>>;
  /** Map<clubNameNorm, Map<round, timestamp ms>> — date du match joué. */
  matchDateByClub: Map<string, Map<number, number>>;
}

/**
 * Retourne pour chaque (round, club) le rang de l'adversaire (1 = leader),
 * et la date de chaque match — nécessaire pour compter les matchs réellement
 * joués sur une fenêtre de temps donnée (fatigue).
 */
export async function getRoundToOpponentRankMap(
  championshipId: number | string
): Promise<RoundContext> {
  const [standingsData, matchResults] = await Promise.all([
    fetchSofascoreStandingsAndFixtures(championshipId),
    getSofascoreMatchResults(championshipId, 20),
  ]);

  const matchDateByClub = new Map<string, Map<number, number>>();
  const noteDate = (clubNorm: string, round: number, timestampSec: number | undefined) => {
    if (!timestampSec) return;
    if (!matchDateByClub.has(clubNorm)) matchDateByClub.set(clubNorm, new Map());
    matchDateByClub.get(clubNorm)!.set(round, timestampSec * 1000);
  };

  if (!standingsData?.rankByClub || standingsData.rankByClub.size === 0) {
    for (const m of matchResults) {
      noteDate(normalizeClubName(m.homeTeam), m.round, m.startTimestamp);
      noteDate(normalizeClubName(m.awayTeam), m.round, m.startTimestamp);
    }
    return { rankByRound: new Map(), matchDateByClub };
  }

  const rankByClub = standingsData.rankByClub;
  const result = new Map<number, Map<string, number>>();

  for (const m of matchResults) {
    const round = m.round;
    const homeNorm = normalizeClubName(m.homeTeam);
    const awayNorm = normalizeClubName(m.awayTeam);
    noteDate(homeNorm, round, m.startTimestamp);
    noteDate(awayNorm, round, m.startTimestamp);

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

  return { rankByRound: result, matchDateByClub };
}

/** Nombre de matchs de championnat joués par le club sur les `days` derniers jours. */
export function countMatchesInWindow(
  matchDateByClub: Map<string, Map<number, number>>,
  clubName: string | undefined,
  rounds: number[] | undefined,
  days: number,
  now: Date = new Date()
): number | undefined {
  if (!clubName?.trim() || !rounds?.length || matchDateByClub.size === 0) return undefined;
  const clubNorm = normalizeClubName(clubName);
  let dates = matchDateByClub.get(clubNorm);
  if (!dates) {
    for (const [key, value] of matchDateByClub) {
      if (key.includes(clubNorm) || clubNorm.includes(key)) {
        dates = value;
        break;
      }
    }
  }
  if (!dates) return undefined;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const round of rounds) {
    const ts = dates.get(round);
    if (ts != null && ts >= cutoff && ts <= now.getTime()) count++;
  }
  return count;
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
