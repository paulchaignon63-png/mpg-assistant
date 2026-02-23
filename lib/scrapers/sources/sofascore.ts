/**
 * Scraper Sofascore - notes, stats
 * https://www.sofascore.com/
 *
 * L'API interne (api.sofascore.com) fournit classement et matchs.
 * Utilisée via lib/sofascore-client.ts pour la difficulté adversaire.
 * Aucun endpoint blessures trouvé - Transfermarkt reste la source pour ça.
 */

import type { ScrapedInjury } from "@/types/scraped";

/** Stub - Sofascore n'expose pas d'endpoint blessures. Voir sofascore-client pour classement/matchs. */
export async function scrapeSofascoreInjuries(): Promise<ScrapedInjury[]> {
  return [];
}
