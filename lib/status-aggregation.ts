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

/** Retourne true si le nom (ex. "Dembélé Ousmane") matche au moins une entrée du set (ex. "ousmane dembele") par tokens. */
function isApteMatch(playerName: string, apteSet: Set<string>): boolean {
  if (!playerName?.trim() || apteSet.size === 0) return false;
  const n = normalize(playerName);
  if (apteSet.has(n)) return true;
  const tokens = n.split(" ").filter(Boolean);
  for (const entry of apteSet) {
    if (n.includes(entry) || entry.includes(n)) return true;
    const entryTokens = entry.split(" ").filter(Boolean);
    const common = tokens.filter((t) => entryTokens.includes(t));
    if (common.length >= 2) return true;
  }
  return false;
}

export interface ResolvedInjuries {
  injured: string[];
  doubtful: string[];
  injuredItems?: InjuryItemWithContext[];
  doubtfulItems?: InjuryItemWithContext[];
}

/**
 * Applique la réconciliation selon la config :
 * - inSquadOrReturnSet : joueurs annoncés "dans le groupe" / "de retour" (news) → toujours retirés des listes blessés/douteux.
 * - Si TRUST_MPG_APTE_WHEN_CONFLICT et mpgApteSet fourni : en plus, retire tout joueur que MPG indique comme apte.
 * mpgApteSet = Set de noms normalisés (ex. depuis l'API MPG quand elle exposera un statut "available").
 */
export function resolveInjuriesWithPriority(
  injured: string[],
  doubtful: string[],
  injuredItems: InjuryItemWithContext[] | undefined,
  doubtfulItems: InjuryItemWithContext[] | undefined,
  mpgApteSet: Set<string>,
  config?: { trustMpgApteWhenConflict?: boolean },
  inSquadOrReturnSet?: Set<string>
): ResolvedInjuries {
  const cfg = config ?? getStatusSourcesConfig();
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  // Toujours retirer les joueurs annoncés dans le groupe / de retour (news)
  const apteFromNews = inSquadOrReturnSet ?? new Set<string>();
  let injuredFiltered = injured.filter((n) => !isApteMatch(n, apteFromNews));
  let doubtfulFiltered = doubtful.filter((n) => !isApteMatch(n, apteFromNews));
  let injuredItemsFiltered =
    injuredItems?.filter((it) => !isApteMatch(it.playerName, apteFromNews));
  let doubtfulItemsFiltered =
    doubtfulItems?.filter((it) => !isApteMatch(it.playerName, apteFromNews));

  if (process.env.NODE_ENV === "development" && apteFromNews.size > 0) {
    const removed = [
      ...injured.filter((n) => isApteMatch(n, apteFromNews)),
      ...doubtful.filter((n) => isApteMatch(n, apteFromNews)),
    ];
    if (removed.length > 0) {
      console.log("[Status] Annonces « dans le groupe » / « de retour » : retirés des listes blessés/douteux:", removed.join(", "));
    }
  }

  const trustMpg = cfg.trustMpgApteWhenConflict && mpgApteSet.size > 0;
  if (trustMpg) {
    injuredFiltered = injuredFiltered.filter((n) => !mpgApteSet.has(normalize(n)));
    doubtfulFiltered = doubtfulFiltered.filter((n) => !mpgApteSet.has(normalize(n)));
    injuredItemsFiltered =
      injuredItemsFiltered?.filter((it) => !mpgApteSet.has(normalize(it.playerName)));
    doubtfulItemsFiltered =
      doubtfulItemsFiltered?.filter((it) => !mpgApteSet.has(normalize(it.playerName)));

    if (process.env.NODE_ENV === "development") {
      const removed = [
        ...injured.filter((n) => mpgApteSet.has(normalize(n))),
        ...doubtful.filter((n) => mpgApteSet.has(normalize(n))),
      ];
      if (removed.length > 0) {
        console.log("[Status] Réconciliation MPG (apte) : retirés des listes blessés/douteux:", removed.join(", "));
      }
    }
  }

  return {
    injured: injuredFiltered,
    doubtful: doubtfulFiltered,
    injuredItems: injuredItemsFiltered?.length ? injuredItemsFiltered : undefined,
    doubtfulItems: doubtfulItemsFiltered?.length ? doubtfulItemsFiltered : undefined,
  };
}
