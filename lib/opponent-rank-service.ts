/**
 * Service classement adversaire - utilise API-Football
 * Pour chaque club, détermine le rang du prochain adversaire (1 = leader)
 *
 * Fallback API-Football = Sofascore (voir lib/sources-fallback.ts)
 */

import {
  createApiFootballClient,
  getApiFootballSeason,
  type ApiFootballFixture,
  type ApiFootballStandingRow,
} from "./api-football";

const CHAMPIONSHIP_TO_LEAGUE: Record<string, number> = {
  "1": 61,
  "2": 39,
  "3": 140,
  "4": 62,
  "5": 5,
  "6": 2,
  "7": 203,
  LIGUE_1: 61,
  PREMIER_LEAGUE: 39,
  LIGA: 140,
  LIGUE_2: 62,
  SERIE_A: 5,
  CHAMPIONS_LEAGUE: 2,
  LIGUE_SUPER: 203,
};

function getLeagueId(championshipId: number | string): number {
  const key = String(championshipId);
  return CHAMPIONSHIP_TO_LEAGUE[key] ?? 61;
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

const CLUB_ALIASES: Record<string, string> = {
  psg: "paris saint germain",
  "paris sg": "paris saint germain",
  om: "marseille",
  "ol": "lyon",
  "ogc nice": "nice",
  losc: "lille",
  "rc lens": "lens",
  "stade rennais": "rennes",
  "as monaco": "monaco",
  "real madrid": "real madrid",
  barca: "barcelona",
  "man united": "manchester united",
  "man city": "manchester city",
  "spurs": "tottenham",
};

function namesMatch(poolName: string, apiNameNormalized: string): boolean {
  const na = normalizeClubName(poolName);
  const nb = apiNameNormalized;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const sa = na.replace(/\s/g, "");
  const sb = nb.replace(/\s/g, "");
  if (sa === sb || sa.includes(sb) || sb.includes(sa)) return true;
  const alias = normalizeClubName(CLUB_ALIASES[na] ?? na);
  return alias === nb || alias.includes(nb) || nb.includes(alias);
}

export interface OpponentRankData {
  rankByClub: Map<string, number>;
  totalTeams: number;
}

/**
 * Récupère le rang de l'adversaire pour chaque club.
 * rankByClub: clubName (normalisé API) -> rank (1 = 1er)
 * totalTeams: nombre d'équipes en ligue (pour le multiplicateur)
 */
export async function fetchOpponentRanksByClub(
  championshipId: number | string,
  apiKey: string | undefined
): Promise<OpponentRankData> {
  const map = new Map<string, number>();
  if (!apiKey?.trim()) return { rankByClub: map, totalTeams: 18 };

  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "opponent-rank-service.ts:fetchOpponentRanksByClub",
      message: "fetchOpponentRanksByClub entered, about to call API",
      data: { championshipId, leagueId: getLeagueId(championshipId) },
      timestamp: Date.now(),
      hypothesisId: "A,B",
    }),
  }).catch(() => {});
  // #endregion

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[opponent-rank] Appel API-Football /standings + /fixtures leagueId:", getLeagueId(championshipId), "season:", getApiFootballSeason());
  }

  try {
    const leagueId = getLeagueId(championshipId);
    const season = getApiFootballSeason(); // 2025 pour L1 2025-2026 (année de début)
    const client = createApiFootballClient(apiKey);

    const [standings, fixtures] = await Promise.all([
      client.getStandings(leagueId, season),
      client.getLeagueNextFixtures(leagueId, season, 1),
    ]);

    const rankByTeam = new Map<string, number>();
    for (const row of standings as ApiFootballStandingRow[]) {
      const name = row.team?.name ?? "";
      if (name && row.rank != null) rankByTeam.set(normalizeClubName(name), row.rank);
    }

    const clubToOpponent: Array<{ club: string; opponent: string }> = [];
    for (const f of fixtures as ApiFootballFixture[]) {
      const home = f.teams?.home?.name ?? "";
      const away = f.teams?.away?.name ?? "";
      if (home) clubToOpponent.push({ club: home, opponent: away });
      if (away) clubToOpponent.push({ club: away, opponent: home });
    }

    for (const { club, opponent } of clubToOpponent) {
      const opponentNorm = normalizeClubName(opponent);
      let rank: number | undefined = rankByTeam.get(opponentNorm);
      if (rank == null) {
        for (const [standName, r] of rankByTeam) {
          if (standName === opponentNorm || standName.includes(opponentNorm) || opponentNorm.includes(standName)) {
            rank = r;
            break;
          }
        }
      }
      if (rank == null) continue;
      const clubNorm = normalizeClubName(club);
      const existing = map.get(clubNorm);
      if (existing == null || rank < existing) map.set(clubNorm, rank);
    }

    const totalTeams = Math.max(18, standings.length);
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log(`[API-Football] fetchOpponentRanks OK → ${map.size} clubs avec rang adv`);
    }
    return { rankByClub: map, totalTeams };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[API-Football] fetchOpponentRanks ÉCHEC:", err instanceof Error ? err.message : String(err));
    }
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "opponent-rank-service.ts:catch",
        message: "fetchOpponentRanksByClub failed",
        data: { error: err instanceof Error ? err.message : String(err) },
        timestamp: Date.now(),
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion
    return { rankByClub: map, totalTeams: 18 };
  }
}

/**
 * Trouve le rang adverse pour un club donné à partir de la map.
 */
export function getOpponentRankForClub(
  clubName: string | undefined,
  rankMap: Map<string, number>
): number | undefined {
  if (!clubName?.trim()) return undefined;
  const norm = normalizeClubName(clubName);
  const direct = rankMap.get(norm);
  if (direct != null) return direct;
  for (const [key, rank] of rankMap) {
    if (namesMatch(clubName, key)) return rank;
  }
  return undefined;
}
