/**
 * Résolution des statuts (blessé, incertain, suspendu) contre l'effectif réel.
 *
 * Les sources fournissent des noms libres ; on les rapproche des joueurs du
 * pool via lib/player-matching, qui refuse les rapprochements ambigus. Le
 * résultat est indexé par joueur, ce qui supprime tout rapprochement de noms
 * en aval : le calcul de score ne lit plus que des drapeaux booléens.
 */

import {
  resolveEntriesToPlayers,
  type PlayerRef,
  type StatusEntry,
} from "./player-matching";
import { getStatusSourcesConfig } from "./status-sources-config";

export interface StatusEntryWithReturn extends StatusEntry {
  returnDate?: string;
  reason?: string;
}

export interface StatusInput {
  injured: StatusEntryWithReturn[];
  doubtful: StatusEntryWithReturn[];
  suspended: StatusEntryWithReturn[];
  /** Annonces « dans le groupe » / « de retour » : lèvent une absence. */
  apte: StatusEntry[];
  /** Joueurs que MPG signale disponibles (pastille verte). */
  mpgAvailable: StatusEntry[];
}

export interface ResolvedStatuses {
  injuredByIndex: Map<number, StatusEntryWithReturn>;
  doubtfulByIndex: Map<number, StatusEntryWithReturn>;
  suspendedByIndex: Map<number, StatusEntryWithReturn>;
}

/**
 * Rapproche chaque source de l'effectif, puis applique les levées d'absence :
 * une annonce « de retour » retire le joueur des blessés/incertains, et la
 * disponibilité MPG fait de même si TRUST_MPG_APTE_WHEN_CONFLICT est activé.
 */
export function resolvePlayerStatuses(
  players: PlayerRef[],
  input: StatusInput,
  config?: { trustMpgApteWhenConflict?: boolean }
): ResolvedStatuses {
  const cfg = config ?? getStatusSourcesConfig();

  const injuredByIndex = resolveEntriesToPlayers(players, input.injured);
  const doubtfulByIndex = resolveEntriesToPlayers(players, input.doubtful);
  const suspendedByIndex = resolveEntriesToPlayers(players, input.suspended);
  const apteByIndex = resolveEntriesToPlayers(players, input.apte);

  for (const index of apteByIndex.keys()) {
    injuredByIndex.delete(index);
    doubtfulByIndex.delete(index);
  }

  if (cfg.trustMpgApteWhenConflict && input.mpgAvailable.length > 0) {
    const mpgByIndex = resolveEntriesToPlayers(players, input.mpgAvailable);
    for (const index of mpgByIndex.keys()) {
      injuredByIndex.delete(index);
      doubtfulByIndex.delete(index);
    }
  }

  // Un joueur blessé n'est pas en plus « incertain ».
  for (const index of injuredByIndex.keys()) doubtfulByIndex.delete(index);

  return { injuredByIndex, doubtfulByIndex, suspendedByIndex };
}
