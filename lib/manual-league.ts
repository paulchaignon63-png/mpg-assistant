/**
 * Ligues créées à la main, mémorisées sur l'appareil (localStorage).
 *
 * Phase 1 : pas de compte, pas de serveur. Une ligue = un championnat + un
 * effectif (liste d'identifiants de joueurs du vivier) + une formation.
 * La phase 2 (comptes + synchro) réutilisera ces mêmes types.
 */

import type { RosterPlayer } from "./mpgstats-client";

const STORAGE_KEY = "manual_leagues_v1";

export interface ManualLeague {
  id: string;
  name: string;
  championshipId: string;
  formation: number;
  /** Identifiants des joueurs de l'effectif (clé RosterPlayer.id). */
  playerIds: string[];
  createdAt: number;
  updatedAt: number;
}

function safeParse(raw: string | null): ManualLeague[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ManualLeague[]) : [];
  } catch {
    return [];
  }
}

/** Toutes les ligues, plus récentes d'abord. */
export function listLeagues(): ManualLeague[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY)).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
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
  formation?: number;
}): ManualLeague {
  const now = Date.now();
  const league: ManualLeague = {
    id: newId(),
    name: input.name.trim() || "Ma ligue",
    championshipId: input.championshipId,
    formation: input.formation ?? 343,
    playerIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const all = listLeagues();
  persist([league, ...all]);
  return league;
}

export function updateLeague(
  id: string,
  patch: Partial<Pick<ManualLeague, "name" | "formation" | "playerIds">>
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

/** Ajoute ou retire un joueur de l'effectif ; renvoie la liste d'ids à jour. */
export function togglePlayer(league: ManualLeague, playerId: string): string[] {
  const set = new Set(league.playerIds);
  if (set.has(playerId)) set.delete(playerId);
  else set.add(playerId);
  return Array.from(set);
}

export type { RosterPlayer };
