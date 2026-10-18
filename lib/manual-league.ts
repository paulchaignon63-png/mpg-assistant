/**
 * Ligues mémorisées sur l'appareil (localStorage).
 *
 * Une ligue = un championnat + un effectif (identifiants de joueurs MPGStats)
 * + les réglages de la compo (formation, mode, hypothèses), l'adversaire de
 * la journée, les bonus restants et l'historique des pronostics (pour le
 * bilan d'après-journée).
 */

const STORAGE_KEY = "manual_leagues_v1";

export type LeagueMode = "safe" | "balanced" | "poker";

/** Pronostic figé au moment où la compo a été consultée, pour le bilan. */
export interface SavedPrediction {
  seasonRound: string; // `${championshipId}:${round}`
  round: number;
  savedAt: number;
  formation: number;
  teamMean: number;
  captainId: string | null;
  starters: string[];
  bench: string[];
  /** Note attendue et P(titulaire) par joueur. */
  players: Record<string, { noteMean: number; pStart: number; value: number; name: string; position: string }>;
}

export interface ManualLeague {
  id: string;
  name: string;
  championshipId: string;
  /** "auto" = le moteur choisit la formation. */
  formation: number | "auto";
  mode: LeagueMode;
  /** Identifiants des joueurs de l'effectif (mpg_<id MPGStats>). */
  playerIds: string[];
  /** Hypothèses de titularisation saisies par l'utilisateur (0-1). */
  overrides: Record<string, number>;
  /** Effectif de l'adversaire de la journée. */
  opponentPlayerIds: string[];
  opponentName?: string;
  opponentCheatCode: boolean;
  /** Bonus MPG restants (code → nombre). */
  bonuses: Record<string, number>;
  history: SavedPrediction[];
  createdAt: number;
  updatedAt: number;
}

function migrate(raw: Partial<ManualLeague> & { id: string; name: string; championshipId: string }): ManualLeague {
  const now = Date.now();
  return {
    formation: "auto",
    mode: "balanced",
    playerIds: [],
    overrides: {},
    opponentPlayerIds: [],
    opponentCheatCode: false,
    bonuses: {},
    history: [],
    createdAt: now,
    updatedAt: now,
    ...raw,
  } as ManualLeague;
}

function safeParse(raw: string | null): ManualLeague[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && x.id).map(migrate) : [];
  } catch {
    return [];
  }
}

/** Toutes les ligues, plus récentes d'abord. */
export function listLeagues(): ManualLeague[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY)).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getLeague(id: string): ManualLeague | undefined {
  return listLeagues().find((l) => l.id === id);
}

function persist(leagues: ManualLeague[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leagues));
  } catch {
    /* quota plein ou stockage bloqué : on ignore silencieusement */
  }
}

/** Identifiant court sans dépendance externe. */
function newId(): string {
  return `lg_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createLeague(input: {
  name: string;
  championshipId: string;
  playerIds?: string[];
}): ManualLeague {
  const league = migrate({
    id: newId(),
    name: input.name.trim() || "Ma ligue",
    championshipId: input.championshipId,
    playerIds: input.playerIds ?? [],
  });
  persist([league, ...listLeagues()]);
  return league;
}

export function updateLeague(
  id: string,
  patch: Partial<Omit<ManualLeague, "id" | "createdAt" | "updatedAt">>
): ManualLeague | undefined {
  const all = listLeagues();
  const idx = all.findIndex((l) => l.id === id);
  if (idx === -1) return undefined;
  const updated: ManualLeague = { ...all[idx], ...patch, updatedAt: Date.now() };
  all[idx] = updated;
  persist(all);
  return updated;
}

export function deleteLeague(id: string): void {
  persist(listLeagues().filter((l) => l.id !== id));
}

/** Garde le dernier pronostic consulté pour chaque journée (10 journées max). */
export function savePrediction(id: string, prediction: SavedPrediction): void {
  const league = getLeague(id);
  if (!league) return;
  const history = [prediction, ...league.history.filter((h) => h.seasonRound !== prediction.seasonRound)].slice(0, 10);
  updateLeague(id, { history });
}

/** Code de partage d'une ligue (pour l'extension navigateur). */
export function exportLeagueCode(league: ManualLeague): string {
  const payload = { c: league.championshipId, n: league.name, p: league.playerIds.map((x) => x.replace(/^mpg_/, "")) };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function parseLeagueCode(code: string): { championshipId: string; name: string; playerIds: string[] } | null {
  try {
    const v = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!v?.c || !Array.isArray(v.p)) return null;
    return { championshipId: String(v.c), name: String(v.n ?? "Ma ligue"), playerIds: v.p.map((x: string) => `mpg_${x}`) };
  } catch {
    return null;
  }
}

export interface RosterPlayer {
  id: string;
  name: string;
  club: string;
  position: "G" | "D" | "M" | "A";
  detailedPosition?: string;
  quotation?: number | null;
  average?: number | null;
  matches?: number;
}
