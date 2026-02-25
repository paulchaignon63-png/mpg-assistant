/**
 * Service forme équipe - série des 5 derniers matchs par club
 * Utilise les résultats Sofascore pour calculer victoires/nuls/défaites
 */

import { getSofascoreMatchResults, type SofascoreMatchResult } from "./sofascore-client";

export interface TeamFormResult {
  winsLast5: number;
  drawsLast5: number;
  lossesLast5: number;
  goalsFor: number;
  goalsAgainst: number;
}

function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

/**
 * Retourne la forme des clubs demandés (5 derniers matchs).
 */
export async function getTeamFormForClubs(
  championshipId: number | string,
  clubNames: string[]
): Promise<Map<string, TeamFormResult>> {
  const results = await getSofascoreMatchResults(championshipId, 15);

  const byClub = new Map<string, Array<{ match: SofascoreMatchResult; isHome: boolean }>>();
  for (const r of results) {
    const homeNorm = normalizeClubName(r.homeTeam);
    const awayNorm = normalizeClubName(r.awayTeam);
    for (const club of clubNames) {
      const clubNorm = normalizeClubName(club);
      if (namesMatch(homeNorm, clubNorm)) {
        if (!byClub.has(club)) byClub.set(club, []);
        byClub.get(club)!.push({ match: r, isHome: true });
      }
      if (namesMatch(awayNorm, clubNorm)) {
        if (!byClub.has(club)) byClub.set(club, []);
        byClub.get(club)!.push({ match: r, isHome: false });
      }
    }
  }

  const result = new Map<string, TeamFormResult>();
  for (const [club, matches] of byClub) {
    const sorted = [...matches].sort((a, b) => b.match.startTimestamp - a.match.startTimestamp);
    const last5 = sorted.slice(0, 5);

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let gf = 0;
    let ga = 0;

    for (const { match: m, isHome } of last5) {
      const ourScore = isHome ? m.homeScore : m.awayScore;
      const theirScore = isHome ? m.awayScore : m.homeScore;
      gf += ourScore;
      ga += theirScore;
      if (ourScore > theirScore) wins++;
      else if (ourScore < theirScore) losses++;
      else draws++;
    }

    result.set(club, {
      winsLast5: wins,
      drawsLast5: draws,
      lossesLast5: losses,
      goalsFor: gf,
      goalsAgainst: ga,
    });
  }

  return result;
}

/**
 * Multiplicateur selon le nombre de victoires sur les 5 derniers matchs.
 */
export function getTeamFormMultiplier(winsLast5: number): number {
  if (winsLast5 >= 4) return 1.12;
  if (winsLast5 >= 2) return 1.0;
  return 0.9;
}
