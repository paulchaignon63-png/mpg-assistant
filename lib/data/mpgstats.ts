/**
 * Chargement d'un championnat depuis MPGStats (fichier public, un appel).
 *
 * Contient tout ce dont le moteur a besoin, pour la saison en cours ET la
 * précédente : historique match par match de chaque joueur (note, minutes,
 * buts, entré en jeu ou titulaire), incidents (blessures, suspensions,
 * cartons), clubs (Elo, classement), calendrier avec scores et cotes des
 * bookmakers pour les matchs à venir.
 *
 * Mis en cache 15 minutes côté serveur (MPGStats se met à jour environ toutes
 * les heures).
 */

import { clubKey } from "../clubs";
import type { Pos } from "../engine/mpg-rules";

const MPGSTATS_URL = "https://backend.mpgstats.fr";

export const CHAMPIONSHIP_SLUGS: Record<string, string> = {
  "1": "Ligue-1",
  "2": "Premier-League",
  "3": "Liga",
  "4": "Ligue-2",
  "5": "Serie-A",
};

export function championshipSlug(championshipId: string | number): string {
  return CHAMPIONSHIP_SLUGS[String(championshipId)] ?? "Ligue-1";
}

// --- Format brut MPGStats ---------------------------------------------------

interface RawMatchRow {
  n?: number; // note
  m?: number; // minutes
  g?: number; // buts
  e?: number; // id d'événement
  s?: number; // 1 = entré en jeu (non titulaire)
  c?: number; // club au moment du match
  D?: number;
}

interface RawIncident {
  t?: string; // I blessure, S suspension, Y jaune, R rouge, H hors groupe…
  d?: string;
  dE?: number;
  e?: number;
}

interface RawPlayer {
  i?: number;
  n?: string;
  f?: string | null;
  fp?: string;
  c?: number;
  r?: number;
  rh?: Array<{ d?: number; f?: number; t?: number }>;
  s?: Record<string, number>;
  es?: Record<string, number>;
  p?: RawMatchRow[];
  fo?: RawIncident[];
}

interface RawClub {
  i?: number;
  n?: string;
  rn?: string;
  a?: string;
  el?: number;
  s?: { w?: number; l?: number; d?: number; pl?: number; p?: number; GS?: number; GT?: number };
}

interface RawEvent {
  i?: number;
  d?: number;
  s?: number;
  dB?: number;
  t1?: number;
  t2?: number;
  t1s?: number;
  t2s?: number;
  o?: { h?: number | null; d?: number | null; a?: number | null; hc?: number; dc?: number; ac?: number };
}

interface RawSeason {
  i?: number;
  n?: string;
  mD?: number;
  cD?: { d?: number; nD?: number; lD?: number };
  c?: number[];
}

interface RawFile {
  bD?: string;
  mL?: { i?: number; n?: string; aS?: RawSeason; lS?: RawSeason };
  p?: RawPlayer[];
  c?: RawClub[];
  e?: RawEvent[];
}

// --- Format exploité par l'app ---------------------------------------------

export interface Club {
  id: number;
  name: string;
  longName?: string;
  abbr?: string;
  elo: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  wins?: number;
}

export interface FixtureOdds {
  /** Probabilités implicites (marge retirée) : victoire domicile, nul, victoire extérieur. */
  home: number;
  draw: number;
  away: number;
}

export interface Fixture {
  id: number;
  seasonId: number;
  round: number;
  kickoff: number; // secondes
  homeId: number;
  awayId: number;
  homeScore?: number;
  awayScore?: number;
  odds?: FixtureOdds;
}

export interface PlayerMatch {
  eventId: number;
  seasonId: number;
  round: number;
  note: number;
  minutes: number;
  goals: number;
  started: boolean;
  clubId?: number;
}

export type PlayerStatus = "ok" | "injured" | "suspended" | "doubtful" | "out";

export interface Incident {
  type: string;
  label?: string;
  eventId?: number;
  returnAt?: number;
}

export interface Player {
  id: string; // mpg_<id MPGStats>
  mpgStatsId: number;
  name: string;
  firstName: string;
  lastName: string;
  clubId?: number;
  club: string;
  position: Pos;
  /** Poste détaillé : G, DC, DL, MD, MO, A. */
  detailedPosition: string;
  quotation?: number;
  /** Changements de cote de la saison en cours : date (s), avant, après. */
  quotationHistory: Array<{ at: number; from: number; to: number }>;
  matches: PlayerMatch[];
  incidents: Incident[];
  /** Taux de titularisation MPGStats saison passée / en cours. */
  startRate?: number;
  passAccuracy?: number;
}

export interface ChampionshipSnapshot {
  championshipId: string;
  name: string;
  builtAt?: string;
  currentSeasonId: number;
  previousSeasonId?: number;
  roundsPerSeason: number;
  /** Dernière journée disputée de la saison en cours. */
  lastPlayedRound: number;
  clubs: Map<number, Club>;
  currentClubIds: number[];
  fixtures: Fixture[];
  /** Matchs dont les notes des joueurs sont publiées (le score arrive avant les notes). */
  ratedEventIds: Set<number>;
  players: Player[];
}

function mapPosition(fp: string | undefined): Pos {
  const p = (fp ?? "").toUpperCase();
  if (p.startsWith("G")) return "G";
  if (p.startsWith("D")) return "D";
  if (p.startsWith("M")) return "M";
  if (p.startsWith("A")) return "A";
  return "M";
}

/** Retire la marge du bookmaker et normalise les trois issues. */
function impliedOdds(o: RawEvent["o"]): FixtureOdds | undefined {
  if (!o) return undefined;
  let h: number | undefined;
  let d: number | undefined;
  let a: number | undefined;
  if (o.h && o.d && o.a) {
    h = 1 / o.h;
    d = 1 / o.d;
    a = 1 / o.a;
  } else if (o.hc != null && o.dc != null && o.ac != null) {
    h = o.hc;
    d = o.dc;
    a = o.ac;
  }
  if (h == null || d == null || a == null) return undefined;
  const sum = h + d + a;
  if (sum <= 0) return undefined;
  return { home: h / sum, draw: d / sum, away: a / sum };
}

export function parseChampionship(championshipId: string, raw: RawFile): ChampionshipSnapshot {
  const current = raw.mL?.aS ?? {};
  const previous = raw.mL?.lS;
  const currentSeasonId = current.i ?? 0;

  const clubs = new Map<number, Club>();
  for (const c of raw.c ?? []) {
    if (c.i == null) continue;
    clubs.set(c.i, {
      id: c.i,
      name: c.n ?? c.rn ?? `Club ${c.i}`,
      longName: c.rn,
      abbr: c.a,
      elo: c.el ?? 1500,
      points: c.s?.p,
      goalsFor: c.s?.GS,
      goalsAgainst: c.s?.GT,
      wins: c.s?.w,
    });
  }

  const fixtures: Fixture[] = [];
  const fixtureById = new Map<number, Fixture>();
  for (const e of raw.e ?? []) {
    if (e.i == null || e.dB == null || e.t1 == null || e.t2 == null || e.d == null || e.s == null) continue;
    const f: Fixture = {
      id: e.i,
      seasonId: e.s,
      round: e.d,
      kickoff: e.dB,
      homeId: e.t1,
      awayId: e.t2,
      homeScore: e.t1s ?? undefined,
      awayScore: e.t2s ?? undefined,
      odds: impliedOdds(e.o),
    };
    fixtures.push(f);
    fixtureById.set(f.id, f);
  }

  const players: Player[] = [];
  for (const p of raw.p ?? []) {
    if (p.i == null) continue;
    const lastName = (p.n ?? "").trim();
    const firstName = (p.f ?? "").trim();
    const name = [firstName, lastName].filter(Boolean).join(" ");
    if (!name) continue;

    const matches: PlayerMatch[] = [];
    for (const m of p.p ?? []) {
      const f = m.e != null ? fixtureById.get(m.e) : undefined;
      if (!f) continue;
      matches.push({
        eventId: f.id,
        seasonId: f.seasonId,
        round: f.round,
        note: m.n ?? 0,
        minutes: m.m ?? 0,
        goals: m.g ?? 0,
        started: (m.n ?? 0) > 0 && m.s !== 1,
        clubId: m.c,
      });
    }

    const club = p.c != null ? clubs.get(p.c) : undefined;
    const rawPass = p.es?.aP ?? p.es?.oaP;
    players.push({
      id: `mpg_${p.i}`,
      mpgStatsId: p.i,
      name,
      firstName,
      lastName,
      clubId: p.c,
      club: club?.name ?? "",
      position: mapPosition(p.fp),
      detailedPosition: (p.fp ?? "").toUpperCase(),
      quotation: p.r,
      quotationHistory: (p.rh ?? [])
        .filter((h) => h.d != null && h.f != null && h.t != null)
        .map((h) => ({ at: h.d!, from: h.f!, to: h.t! }))
        .sort((a, b) => a.at - b.at),
      matches,
      incidents: (p.fo ?? []).map((f) => ({ type: (f.t ?? "").toUpperCase(), label: f.d, eventId: f.e, returnAt: f.dE })),
      startRate: p.s?.tr ?? p.s?.Otr,
      passAccuracy: rawPass != null ? Math.round(rawPass * 100) : undefined,
    });
  }

  let lastPlayedRound = current.cD?.lD ?? 0;
  if (!lastPlayedRound) {
    const now = Date.now() / 1000;
    for (const f of fixtures) {
      if (f.seasonId === currentSeasonId && f.kickoff <= now) lastPlayedRound = Math.max(lastPlayedRound, f.round);
    }
  }

  return {
    championshipId,
    name: raw.mL?.n ?? championshipSlug(championshipId),
    builtAt: raw.bD,
    currentSeasonId,
    previousSeasonId: previous?.i,
    roundsPerSeason: current.mD ?? 38,
    lastPlayedRound,
    clubs,
    currentClubIds: (current.c ?? []).filter((id) => clubs.has(id)),
    fixtures,
    ratedEventIds: new Set(players.flatMap((p) => p.matches.filter((m) => m.note > 0).map((m) => m.eventId))),
    players,
  };
}

/** Télécharge et analyse un championnat. */
export async function loadChampionship(championshipId: string | number): Promise<ChampionshipSnapshot | null> {
  const id = String(championshipId);
  const url = `${MPGSTATS_URL}/leagues/${championshipSlug(id)}_v2.json`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 } } as RequestInit);
    if (!res.ok) return null;
    return parseChampionship(id, (await res.json()) as RawFile);
  } catch {
    return null;
  }
}

// --- Lecture des incidents --------------------------------------------------

/** Libellés de blessure qui signalent en fait un doute, pas une absence. */
const DOUBT_LABELS = ["incertain", "touche", "en reprise", "gene", "a surveiller", "reprise"];
/** Libellés qui signalent un retour : le joueur est apte. */
const FIT_LABELS = ["dans le groupe", "de retour", "apte", "retour"];

function norm(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/**
 * Statut d'un joueur pour une liste d'événements (la journée visée).
 *
 * Corrige l'ancienne lecture : « Dans le groupe » était lu comme une
 * blessure (type I) et sortait du 11 un joueur… disponible ; « Hors groupe »
 * (type H) était lu comme un simple doute alors que le joueur n'est pas
 * convoqué.
 */
export function statusForEvents(
  incidents: Incident[],
  eventIds: Set<number>
): { status: PlayerStatus; label?: string; returnAt?: number } {
  const relevant = incidents.filter((i) => i.eventId != null && eventIds.has(i.eventId));
  let best: { status: PlayerStatus; label?: string; returnAt?: number } = { status: "ok" };
  const rank: Record<PlayerStatus, number> = { ok: 0, doubtful: 1, out: 2, injured: 3, suspended: 4 };
  for (const inc of relevant) {
    const label = norm(inc.label);
    let status: PlayerStatus | null = null;
    if (inc.type === "S") status = "suspended";
    else if (inc.type === "H") status = "out";
    else if (inc.type === "I") {
      if (FIT_LABELS.some((l) => label.startsWith(l))) status = "ok";
      else if (DOUBT_LABELS.some((l) => label.startsWith(l))) status = "doubtful";
      else status = "injured";
    }
    if (status && rank[status] > rank[best.status]) {
      best = { status, label: inc.label, returnAt: inc.returnAt };
    }
  }
  return best;
}

/** Cartons jaunes reçus lors des `lastN` derniers matchs de championnat joués. */
export function yellowCardsInLast(player: Player, lastN: number, beforeKickoff: number, fixtures: Map<number, Fixture>): number {
  const yellowEvents = new Set(player.incidents.filter((i) => i.type === "Y" && i.eventId != null).map((i) => i.eventId!));
  const played = player.matches
    .map((m) => ({ m, f: fixtures.get(m.eventId) }))
    .filter((x) => x.f && x.f.kickoff < beforeKickoff && x.m.note > 0)
    .sort((a, b) => b.f!.kickoff - a.f!.kickoff)
    .slice(0, lastN);
  return played.filter((x) => yellowEvents.has(x.m.eventId)).length;
}

/**
 * Cote du joueur à une date. Pour la saison en cours, l'historique des
 * changements donne la vraie valeur de l'époque ; pour une saison passée elle
 * est inconnue (renvoie undefined) : la cote actuelle refléterait des matchs
 * postérieurs et fausserait le banc d'essai.
 */
export function quotationAt(player: Player, at: number, isCurrentSeason: boolean): number | undefined {
  if (!isCurrentSeason) return undefined;
  const h = player.quotationHistory;
  if (h.length === 0) return player.quotation;
  let q = h[0].from;
  for (const c of h) if (c.at <= at) q = c.to;
  return q;
}

/** Clé de club MPGStats → nom, pour rapprocher d'autres sources. */
export function clubNames(snapshot: ChampionshipSnapshot): string[] {
  return snapshot.currentClubIds.map((id) => snapshot.clubs.get(id)!.name);
}

export { clubKey };
