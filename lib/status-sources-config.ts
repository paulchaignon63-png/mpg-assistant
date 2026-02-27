/**
 * Config hiérarchie des sources pour les statuts (blessés, incertains, suspendus).
 * Ordre de priorité = réactivité (RSS > SofaScore > MPG pour les annonces ; MPG fiable pour "apte" une fois officialisé).
 * À croiser : SofaScore, MPG, flux RSS (pas API-Football).
 */

export type StatusSourceId = "rss" | "sofascore" | "transfermarkt" | "mpg";

const DEFAULT_PRIORITY: StatusSourceId[] = ["rss", "sofascore", "transfermarkt", "mpg"];

function parsePriority(value: string | undefined): StatusSourceId[] {
  if (!value?.trim()) return DEFAULT_PRIORITY;
  const parts = value.toLowerCase().split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const valid: StatusSourceId[] = [];
  const allowed = new Set<StatusSourceId>(["rss", "sofascore", "transfermarkt", "mpg"]);
  for (const p of parts) {
    if (allowed.has(p as StatusSourceId)) valid.push(p as StatusSourceId);
  }
  return valid.length > 0 ? valid : DEFAULT_PRIORITY;
}

/**
 * Ordre de priorité des sources en cas de conflit (la première a le dernier mot).
 * Réactivité : RSS (news) > SofaScore > Transfermarkt > MPG.
 * Env : STATUS_SOURCE_PRIORITY = "rss,sofascore,transfermarkt,mpg"
 */
export function getStatusSourcePriority(): StatusSourceId[] {
  return parsePriority(process.env.STATUS_SOURCE_PRIORITY);
}

/**
 * En cas de conflit "blessé/incertain" (autre source) vs "apte" (MPG) :
 * - true  : faire confiance à MPG → retirer le joueur des listes blessés/douteux.
 * - false : rester prudent → garder blessé/incertain.
 * Env : TRUST_MPG_APTE_WHEN_CONFLICT = "1" | "true" pour activer.
 */
export function getTrustMpgApteWhenConflict(): boolean {
  const v = process.env.TRUST_MPG_APTE_WHEN_CONFLICT;
  return v === "1" || v?.toLowerCase() === "true";
}

export interface StatusSourcesConfig {
  priority: StatusSourceId[];
  trustMpgApteWhenConflict: boolean;
}

export function getStatusSourcesConfig(): StatusSourcesConfig {
  return {
    priority: getStatusSourcePriority(),
    trustMpgApteWhenConflict: getTrustMpgApteWhenConflict(),
  };
}
