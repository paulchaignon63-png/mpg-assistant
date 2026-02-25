/**
 * Service blessures - utilise API-Football
 * Sépare les joueurs blessés/suspendus (éliminatoires) des incertains (malus 0.5)
 */

import {
  createApiFootballClient,
  getApiFootballSeason,
  type ApiFootballInjury,
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDoubtful(reason: string): boolean {
  const r = reason.toLowerCase();
  return r.includes("doubtful") || r.includes("doute") || r.includes("uncertain") || r.includes("questionable");
}

export interface InjuriesResult {
  injured: string[];
  doubtful: string[];
}

/** Normalise un nom pour le matching cross-source (API ↔ pool MPG) */
export function normalizeInjuryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .trim();
}

/** Vérifie si un joueur (nom du pool) matche une liste de noms blessés */
export function isPlayerInInjuryList(
  playerName: string,
  injuryNames: string[],
  normalize: (s: string) => string = normalizeInjuryName
): boolean {
  if (!playerName?.trim()) return false;
  const p = normalize(playerName);
  const lastName = p.split(" ").pop() ?? p;
  for (const inj of injuryNames) {
    const i = normalize(inj);
    if (p === i || i === p) return true;
    if (p.includes(i) || i.includes(p)) return true;
    if (lastName && (i.includes(lastName) || lastName.includes(i))) return true;
  }
  return false;
}

export interface InjuryItemWithContext {
  playerName: string;
  clubName?: string;
  returnDate?: string;
  reason?: string;
}

/** Match avec contextualisation : si injury et player ont un club, exiger la correspondance */
export function isPlayerInjuryMatchWithContext(
  playerName: string,
  playerClubName: string | undefined,
  injuryItems: InjuryItemWithContext[],
  normalize: (s: string) => string = normalizeInjuryName
): boolean {
  if (!playerName?.trim() || injuryItems.length === 0) return false;
  const pNorm = normalize(playerName);
  const pClubNorm = playerClubName ? normalize(playerClubName) : undefined;
  const lastName = pNorm.split(" ").pop() ?? pNorm;

  for (const inj of injuryItems) {
    const iNorm = normalize(inj.playerName);
    const nameMatch =
      pNorm === iNorm ||
      iNorm === pNorm ||
      pNorm.includes(iNorm) ||
      iNorm.includes(pNorm) ||
      (lastName && (iNorm.includes(lastName) || lastName.includes(iNorm)));

    if (!nameMatch) continue;

    if (inj.clubName && pClubNorm) {
      const injClubNorm = normalize(inj.clubName);
      const clubMatch =
        injClubNorm === pClubNorm ||
        injClubNorm.includes(pClubNorm) ||
        pClubNorm.includes(injClubNorm);
      if (!clubMatch) continue;
    }
    return true;
  }
  return false;
}

/**
 * Récupère les blessures pour un championnat.
 * injured = hors jeu (score 0)
 * doubtful = incertain (score × 0.5)
 */
export async function fetchInjuries(
  championshipId: number | string,
  apiKey: string | undefined
): Promise<InjuriesResult> {
  if (!apiKey?.trim()) return { injured: [], doubtful: [] };

  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "injuries-service.ts:fetchInjuries",
      message: "fetchInjuries entered, about to call API",
      data: { championshipId, leagueId: getLeagueId(championshipId) },
      timestamp: Date.now(),
      hypothesisId: "A,B",
    }),
  }).catch(() => {});
  // #endregion

  if (process.env.NODE_ENV === "development") {
    const season = getApiFootballSeason();
    // eslint-disable-next-line no-console
    console.log("[injuries-service] Appel API-Football /injuries leagueId:", getLeagueId(championshipId), "season:", season);
  }

  try {
    const leagueId = getLeagueId(championshipId);
    const season = getApiFootballSeason(); // 2025 pour L1 2025-2026 (année de début)
    const client = createApiFootballClient(apiKey);
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "injuries-service.ts:pre-getInjuries",
        message: "about to call client.getInjuries",
        data: { leagueId, season },
        timestamp: Date.now(),
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion
    const raw = await client.getInjuries(leagueId, season);
    const rawArr = Array.isArray(raw) ? raw : [];

    const injured: string[] = [];
    const doubtful: string[] = [];
    const seen = new Set<string>();

    for (const item of rawArr as ApiFootballInjury[]) {
      const name = item.player_name ?? item.player?.name ?? "";
      if (!name) continue;
      const key = normalizeName(name);
      if (seen.has(key)) continue;
      seen.add(key);

      const reason = String((item as ApiFootballInjury).reason ?? "").trim();
      if (isDoubtful(reason)) {
        doubtful.push(name);
      } else {
        injured.push(name);
      }
    }

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log(`[API-Football] fetchInjuries OK → raw=${rawArr.length} → ${injured.length} blessés, ${doubtful.length} incertains`);
    }
    return { injured, doubtful };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[API-Football] fetchInjuries ÉCHEC:", err instanceof Error ? err.message : String(err));
    }
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "injuries-service.ts:catch",
        message: "fetchInjuries failed",
        data: { error: err instanceof Error ? err.message : String(err) },
        timestamp: Date.now(),
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion
    return { injured: [], doubtful: [] };
  }
}
