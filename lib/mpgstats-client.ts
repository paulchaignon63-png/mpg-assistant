/**
 * Client MPGStats - stats des joueurs (average, matchs, goals)
 * https://backend.mpgstats.fr - utilisé par mpg-coach-bot
 */

const MPGSTATS_URL = "https://backend.mpgstats.fr";

const CHAMPIONSHIP_TO_MPGSTATS: Record<string, string> = {
  "1": "Ligue-1",
  "2": "Premier-League",
  "3": "Liga",
  "4": "Ligue-2",
  "5": "Serie-A",
  "6": "Champions-League",
  "7": "Ligue-Super",
  LIGUE_1: "Ligue-1",
  PREMIER_LEAGUE: "Premier-League",
  LIGA: "Liga",
  LIGUE_2: "Ligue-2",
  SERIE_A: "Serie-A",
  CHAMPIONS_LEAGUE: "Champions-League",
  LIGUE_SUPER: "Ligue-Super",
};

export interface MpgStatsPlayer {
  i: number; // id mpgstats
  n: string; // lastName
  f?: string | null; // firstName
  fp?: string; // position (DC, MD, A, etc.)
  c?: number; // clubId
  s?: {
    a?: number; // average
    n?: number; // matchs
    g?: number; // goals
    Sa?: number;
    Sn?: number;
    Sg?: number;
    Oa?: number;
    On?: number;
    Og?: number;
  };
}

export interface MpgStatsChampionship {
  p?: MpgStatsPlayer[];
}

function getLeagueSlug(championshipId: number | string): string {
  const key = String(championshipId);
  return CHAMPIONSHIP_TO_MPGSTATS[key] ?? "Ligue-1";
}

/**
 * Récupère les stats du championnat (average, matchs, goals par joueur)
 */
export async function getMpgStatsPlayers(
  championshipId: number | string
): Promise<Map<string, { average: number; matchs: number; goals: number }>> {
  const slug = getLeagueSlug(championshipId);
  const url = `${MPGSTATS_URL}/leagues/${slug}_v2.json`;
  const res = await fetch(url);
  if (!res.ok) return new Map();

  const data = (await res.json()) as MpgStatsChampionship;
  const players = data.p ?? [];
  const map = new Map<string, { average: number; matchs: number; goals: number }>();

  for (const p of players) {
    const stats = p.s;
    if (!stats) continue;

    // a = average, n = matchs, g = goals (saison en cours)
    const average = stats.a ?? stats.Sa ?? stats.Oa ?? 0;
    const matchs = stats.n ?? stats.Sn ?? stats.On ?? 0;
    const goals = stats.g ?? stats.Sg ?? stats.Og ?? 0;

    const name = [p.n, p.f].filter(Boolean).join(" ").trim() || p.n;
    if (name) {
      map.set(normalizeName(name), { average, matchs, goals });
      // aussi indexer "Nom Prénom" et "Prénom Nom" pour le matching
      if (p.f) {
        map.set(normalizeName(`${p.f} ${p.n}`), { average, matchs, goals });
      }
    }
  }
  return map;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
