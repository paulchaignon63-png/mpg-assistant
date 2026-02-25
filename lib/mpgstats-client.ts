/**
 * Client MPGStats - stats des joueurs (average, matchs, goals)
 * https://backend.mpgstats.fr - utilisé par mpg-coach-bot
 *
 * Fallback MPGStats = Transfermarkt + Sofascore (voir lib/sources-fallback.ts)
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

export interface MpgStatsMatch {
  n?: number; // note du match
  m?: number; // minutes
  g?: number; // buts
  D?: number; // numéro journée
}

export interface MpgStatsPlayer {
  i: number;
  n: string;
  f?: string | null;
  fp?: string;
  c?: number;
  s?: {
    a?: number;
    n?: number;
    g?: number;
    Sa?: number;
    Sn?: number;
    Sg?: number;
    Oa?: number;
    On?: number;
    Og?: number;
  };
  p?: MpgStatsMatch[]; // historique matchs (récent en premier)
}

export interface MpgStatsChampionship {
  p?: MpgStatsPlayer[];
}

function getLeagueSlug(championshipId: number | string): string {
  const key = String(championshipId);
  return CHAMPIONSHIP_TO_MPGSTATS[key] ?? "Ligue-1";
}

export interface MpgStatsEnrichment {
  average: number;
  matchs: number;
  goals: number;
  position?: string;
  averageLast5?: number;
  momentum?: number;
  assists?: number;
  pctTitularisations?: number;
  yellowCards?: number;
  redCards?: number;
  isSuspended?: boolean;
  /** Notes des 5 derniers matchs (récent en premier) */
  last5Notes?: number[];
  /** Minutes jouées par match (5 derniers) */
  last5Minutes?: number[];
  /** Numéro de journée pour chaque des 5 derniers matchs (pour croiser avec adversaire) */
  last5OpponentRounds?: number[];
}

/**
 * Récupère les stats du championnat (average, matchs, goals, position par joueur)
 * La position vient de mpgstats (fp: DC, MD, A, etc.) car le pool MPG ne l'inclut pas
 */
export async function getMpgStatsPlayers(
  championshipId: number | string
): Promise<Map<string, MpgStatsEnrichment>> {
  const slug = getLeagueSlug(championshipId);
  const url = `${MPGSTATS_URL}/leagues/${slug}_v2.json`;
  const res = await fetch(url);
  if (!res.ok) return new Map();

  const data = (await res.json()) as MpgStatsChampionship;
  const players = data.p ?? [];
  const map = new Map<string, MpgStatsEnrichment>();

  for (const p of players) {
    const stats = p.s;
    const position = p.fp;
    const matches = p.p ?? [];

    const average = stats ? (stats.a ?? stats.Sa ?? stats.Oa ?? 0) : 0;
    const matchs = stats ? (stats.n ?? stats.Sn ?? stats.On ?? 0) : 0;
    const goals = stats ? (stats.g ?? stats.Sg ?? stats.Og ?? 0) : 0;

    let averageLast5: number | undefined;
    let momentum: number | undefined;
    const last5Matches = matches.slice(0, 5);
    if (matches.length >= 5) {
      const last5 = last5Matches.map((m) => m.n ?? 0).filter((n) => n > 0);
      averageLast5 = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / last5.length : undefined;
    }
    if (matches.length >= 6) {
      const last3 = matches.slice(0, 3).map((m) => m.n ?? 0).filter((n) => n > 0);
      const prev3 = matches.slice(3, 6).map((m) => m.n ?? 0).filter((n) => n > 0);
      const avgLast3 = last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
      const avgPrev3 = prev3.length > 0 ? prev3.reduce((a, b) => a + b, 0) / prev3.length : 0;
      momentum = avgLast3 - avgPrev3;
    }

    const last5Notes = last5Matches.map((m) => m.n ?? 0);
    const last5Minutes = last5Matches.map((m) => m.m ?? 0);
    const last5OpponentRounds = last5Matches.map((m) => m.D ?? 0);

    const name = [p.n, p.f].filter(Boolean).join(" ").trim() || p.n;
    if (name) {
      const entry: MpgStatsEnrichment = { average, matchs, goals };
      if (position) entry.position = position;
      if (averageLast5 != null) entry.averageLast5 = averageLast5;
      if (momentum != null) entry.momentum = momentum;
      if (last5Notes.some((x) => x > 0)) entry.last5Notes = last5Notes;
      if (last5Minutes.some((x) => x > 0)) entry.last5Minutes = last5Minutes;
      if (last5OpponentRounds.some((x) => x > 0)) entry.last5OpponentRounds = last5OpponentRounds;
      map.set(normalizeName(name), entry);
      if (p.f) {
        map.set(normalizeName(`${p.f} ${p.n}`), entry);
      }
    }
  }
  return map;
}

/**
 * Récupère les stats avec fallback Transfermarkt + Sofascore si MPGStats échoue.
 */
export async function getMpgStatsPlayersWithFallback(
  championshipId: number | string
): Promise<Map<string, MpgStatsEnrichment>> {
  try {
    const map = await getMpgStatsPlayers(championshipId);
    if (map.size > 0) return map;
  } catch {
    // MPGStats échoué, utiliser fallback
  }
  const { getFallbackPlayerStats } = await import("./fallback-stats-service");
  return getFallbackPlayerStats(championshipId);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
