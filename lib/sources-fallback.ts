/**
 * Stratégie de fallback pour les sources de données
 *
 * Pour toute source MPGStats ou API-Football, le fallback est :
 *   Transfermarkt + Sofascore
 *
 * - API-Football (blessures) → Transfermarkt (injuries) + Sofascore (injuries stub)
 * - API-Football (rang adversaire) → Sofascore (standings + fixtures)
 * - MPGStats (stats joueurs) → Transfermarkt + Sofascore (à compléter selon APIs disponibles)
 */

export const FALLBACK_SOURCES = ["transfermarkt", "sofascore"] as const;
export type FallbackSource = (typeof FALLBACK_SOURCES)[number];
