/**
 * Agrégation des statuts blessés/incertains avec hiérarchie des sources (RSS, SofaScore, MPG).
 * Croise les sources et applique la config (priorité, confiance MPG pour "apte").
 */

import type { InjuryItemWithContext } from "./injuries-service";
import { getStatusSourcesConfig } from "./status-sources-config";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ResolvedInjuries {
  injured: string[];
  doubtful: string[];
  injuredItems?: InjuryItemWithContext[];
  doubtfulItems?: InjuryItemWithContext[];
}

/**
 * Applique la réconciliation selon la config :
 * - Si TRUST_MPG_APTE_WHEN_CONFLICT et mpgApteSet fourni : retire des listes blessés/douteux
 *   tout joueur que MPG indique comme apte (clés normalisées dans le Set).
 * - Sinon retourne les listes inchangées.
 * mpgApteSet = Set de noms normalisés (ex. depuis l'API MPG quand elle exposera un statut "available").
 */
export function resolveInjuriesWithPriority(
  injured: string[],
  doubtful: string[],
  injuredItems: InjuryItemWithContext[] | undefined,
  doubtfulItems: InjuryItemWithContext[] | undefined,
  mpgApteSet: Set<string>,
  config?: { trustMpgApteWhenConflict?: boolean }
): ResolvedInjuries {
  const cfg = config ?? getStatusSourcesConfig();
  const trustMpg = cfg.trustMpgApteWhenConflict && mpgApteSet.size > 0;

  if (!trustMpg) {
    return {
      injured: [...injured],
      doubtful: [...doubtful],
      injuredItems: injuredItems?.length ? [...injuredItems] : undefined,
      doubtfulItems: doubtfulItems?.length ? [...doubtfulItems] : undefined,
    };
  }

  const injuredFiltered = injured.filter((n) => !mpgApteSet.has(normalize(n)));
  const doubtfulFiltered = doubtful.filter((n) => !mpgApteSet.has(normalize(n)));
  const injuredItemsFiltered =
    injuredItems?.filter((it) => !mpgApteSet.has(normalize(it.playerName)));
  const doubtfulItemsFiltered =
    doubtfulItems?.filter((it) => !mpgApteSet.has(normalize(it.playerName)));

  if (process.env.NODE_ENV === "development" && (injuredFiltered.length < injured.length || doubtfulFiltered.length < doubtful.length)) {
    const removed = [
      ...injured.filter((n) => mpgApteSet.has(normalize(n))),
      ...doubtful.filter((n) => mpgApteSet.has(normalize(n))),
    ];
    console.log("[Status] Réconciliation MPG (apte) : retirés des listes blessés/douteux:", removed.join(", "));
  }

  return {
    injured: injuredFiltered,
    doubtful: doubtfulFiltered,
    injuredItems: injuredItemsFiltered?.length ? injuredItemsFiltered : undefined,
    doubtfulItems: doubtfulItemsFiltered?.length ? doubtfulItemsFiltered : undefined,
  };
}
