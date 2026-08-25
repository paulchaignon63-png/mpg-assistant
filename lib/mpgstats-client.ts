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

/** Un joueur du vivier d'un championnat, pour composer un effectif à la main. */
export interface RosterPlayer {
  /** Identifiant MPGStats stable, clé de l'effectif manuel. */
  id: string;
  name: string;
  club: string;
  /** Poste normalisé : G, D, M, A. */
  position: "G" | "D" | "M" | "A";
}

/** Poste détaillé MPGStats (DC, DL, MD, MO, A, G…) → convention interne. */
function mapMpgStatsPosition(fp: string | undefined): "G" | "D" | "M" | "A" {
  const p = (fp ?? "").toUpperCase();
  if (p.startsWith("G")) return "G";
  if (p.startsWith("D")) return "D";
  if (p.startsWith("M")) return "M";
  if (p.startsWith("A")) return "A";
  return "M";
}

interface MpgStatsClub {
  i?: number;
  n?: string;
  rn?: string;
}

interface MpgStatsRosterPlayer {
  i?: number;
  n?: string;
  f?: string | null;
  fp?: string;
  c?: number;
}

/**
 * Vivier complet d'un championnat (nom, club, poste par joueur) depuis MPGStats,
 * en un seul appel. Fonctionne depuis Vercel (contrairement à Sofascore, bloqué
 * en 403 sur les IP de datacenter). Le club provient de la table `c` du fichier,
 * donc le filtre par club est fiable.
 */
export async function getChampionshipRoster(
  championshipId: number | string
): Promise<RosterPlayer[]> {
  const slug = getLeagueSlug(championshipId);
  const res = await fetch(`${MPGSTATS_URL}/leagues/${slug}_v2.json`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    p?: MpgStatsRosterPlayer[];
    c?: MpgStatsClub[];
  };

  const clubNameById = new Map<number, string>();
  for (const club of data.c ?? []) {
    if (club.i != null) clubNameById.set(club.i, club.n ?? club.rn ?? `Club ${club.i}`);
  }

  const roster: RosterPlayer[] = [];
  for (const p of data.p ?? []) {
    if (p.i == null) continue;
    const last = (p.n ?? "").trim();
    const first = (p.f ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const club = p.c != null ? clubNameById.get(p.c) ?? "" : "";
    roster.push({
      id: `mpg_${p.i}`,
      name,
      club,
      position: mapMpgStatsPosition(p.fp),
    });
  }

  roster.sort(
    (a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name)
  );
  return roster;
}

/** Joueur du vivier enrichi de ses stats et de son statut, prêt pour le moteur. */
export interface MpgStatsFullPlayer extends RosterPlayer {
  average: number;
  matchs: number;
  goals: number;
  averageLast5?: number;
  momentum?: number;
  last5Notes?: number[];
  last5Minutes?: number[];
  last5OpponentRounds?: number[];
  quotation?: number;
  status: "ok" | "injured" | "suspended" | "doubtful";
  statusReason?: string;
}

/** Résultat complet d'un championnat : joueurs enrichis + date du prochain match. */
export interface ChampionshipData {
  players: Map<string, MpgStatsFullPlayer>;
  nextMatchDate?: Date;
  /** Nombre de journées déjà jouées (pour la régularité). */
  playedRounds: number;
}

interface MpgStatsForfait {
  t?: string; // type : "I" blessure, "S" suspension, autre = incertain
  d?: string; // libellé ("Forfait", "Blessé"…)
  dE?: number; // timestamp (s) associé
  e?: number; // id d'événement concerné
}

interface MpgStatsEvent {
  i?: number; // id
  dB?: number; // coup d'envoi (timestamp s)
  d?: number; // numéro de journée
  s?: number; // id de saison
}

interface MpgStatsFullRow extends MpgStatsRosterPlayer {
  c?: number;
  q?: number; // cote
  s?: MpgStatsPlayer["s"];
  p?: MpgStatsMatch[];
  fo?: MpgStatsForfait[];
}

function statusFromForfaits(
  fo: MpgStatsForfait[] | undefined,
  upcomingEventIds: Set<number>
): { status: MpgStatsFullPlayer["status"]; reason?: string } {
  if (!fo?.length) return { status: "ok" };
  // On ne retient que les forfaits qui concernent la prochaine journée.
  const relevant = fo.filter((f) => f.e != null && upcomingEventIds.has(f.e));
  if (relevant.length === 0) return { status: "ok" };
  const f = relevant[0];
  const type = (f.t ?? "").toUpperCase();
  if (type === "S") return { status: "suspended", reason: f.d };
  if (type === "I") return { status: "injured", reason: f.d };
  return { status: "doubtful", reason: f.d };
}

/**
 * Données complètes d'un championnat pour le calcul du meilleur 11, en un seul
 * appel MPGStats : chaque joueur avec son club, son poste, ses stats de forme
 * et son statut (blessé/suspendu pour la prochaine journée), plus la date du
 * prochain match. Aucune dépendance à MPG ni Sofascore.
 */
export async function getChampionshipData(
  championshipId: number | string
): Promise<ChampionshipData> {
  const slug = getLeagueSlug(championshipId);
  const res = await fetch(`${MPGSTATS_URL}/leagues/${slug}_v2.json`);
  if (!res.ok) return { players: new Map(), playedRounds: 0 };

  const data = (await res.json()) as {
    p?: MpgStatsFullRow[];
    c?: MpgStatsClub[];
    e?: MpgStatsEvent[];
  };

  const clubNameById = new Map<number, string>();
  for (const club of data.c ?? []) {
    if (club.i != null) clubNameById.set(club.i, club.n ?? club.rn ?? `Club ${club.i}`);
  }

  // Prochaine journée : événements à venir les plus proches (fenêtre de ~5 jours).
  const now = Math.floor(Date.now() / 1000);
  const future = (data.e ?? [])
    .filter((e) => e.dB != null && e.dB > now)
    .sort((a, b) => (a.dB ?? 0) - (b.dB ?? 0));
  const nextKickoff = future[0]?.dB;
  const currentSeason = future[0]?.s;
  const upcomingEventIds = new Set<number>();
  let nextMatchDate: Date | undefined;
  if (nextKickoff != null) {
    nextMatchDate = new Date(nextKickoff * 1000);
    const windowEnd = nextKickoff + 5 * 24 * 60 * 60;
    for (const e of future) {
      if (e.dB != null && e.dB <= windowEnd && e.i != null) upcomingEventIds.add(e.i);
    }
  }

  // Journées déjà jouées de la SAISON EN COURS uniquement (le fichier contient
  // aussi les saisons passées, dont les journées vont jusqu'à 34-38).
  let playedRounds = 0;
  for (const e of data.e ?? []) {
    if (
      e.dB != null &&
      e.dB <= now &&
      e.d != null &&
      (currentSeason == null || e.s === currentSeason)
    ) {
      playedRounds = Math.max(playedRounds, e.d);
    }
  }

  const players = new Map<string, MpgStatsFullPlayer>();
  for (const p of data.p ?? []) {
    if (p.i == null) continue;
    const last = (p.n ?? "").trim();
    const first = (p.f ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (!name) continue;

    const stats = p.s;
    const average = stats ? stats.a ?? stats.Sa ?? stats.Oa ?? 0 : 0;
    const matchs = stats ? stats.n ?? stats.Sn ?? stats.On ?? 0 : 0;
    const goals = stats ? stats.g ?? stats.Sg ?? stats.Og ?? 0 : 0;

    const matches = p.p ?? [];
    const last5 = matches.slice(0, 5);
    const notes = last5.map((m) => m.n ?? 0);
    const minutes = last5.map((m) => m.m ?? 0);
    const rounds = last5.map((m) => m.D ?? 0);
    const played5 = last5.map((m) => m.n ?? 0).filter((n) => n > 0);
    const averageLast5 =
      played5.length > 0 ? played5.reduce((a, b) => a + b, 0) / played5.length : undefined;
    let momentum: number | undefined;
    if (matches.length >= 6) {
      const l3 = matches.slice(0, 3).map((m) => m.n ?? 0).filter((n) => n > 0);
      const p3 = matches.slice(3, 6).map((m) => m.n ?? 0).filter((n) => n > 0);
      const al3 = l3.length ? l3.reduce((a, b) => a + b, 0) / l3.length : 0;
      const ap3 = p3.length ? p3.reduce((a, b) => a + b, 0) / p3.length : 0;
      momentum = al3 - ap3;
    }

    const { status, reason } = statusFromForfaits(p.fo, upcomingEventIds);

    players.set(`mpg_${p.i}`, {
      id: `mpg_${p.i}`,
      name,
      club: p.c != null ? clubNameById.get(p.c) ?? "" : "",
      position: mapMpgStatsPosition(p.fp),
      average,
      matchs,
      goals,
      averageLast5,
      momentum,
      last5Notes: notes.some((n) => n > 0) ? notes : undefined,
      last5Minutes: minutes.some((n) => n > 0) ? minutes : undefined,
      last5OpponentRounds: rounds.some((n) => n > 0) ? rounds : undefined,
      quotation: p.q,
      status,
      statusReason: reason,
    });
  }

  return { players, nextMatchDate, playedRounds };
}
