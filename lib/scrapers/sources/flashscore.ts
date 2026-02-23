/**
 * Scraper Flashscore - résultats, classements, livescore
 * https://www.flashscore.fr/
 *
 * NOTE: Flashscore est une SPA (React/Vue). Le contenu principal est chargé en JS.
 * Cheerio seul ne suffit pas. Options :
 * 1. Puppeteer/Playwright (lourd)
 * 2. Chercher des endpoints API exposés (risque de blocage)
 * 3. Utiliser une API tierce (ex. API-Sport) pour les mêmes données
 *
 * Pour l'instant : stub qui retourne [].
 * À compléter si on ajoute Puppeteer au projet.
 */

import type { ScrapedNewsItem } from "@/types/scraped";

export async function scrapeFlashscore(): Promise<ScrapedNewsItem[]> {
  // TODO: Implémenter avec Puppeteer/Playwright si besoin
  // La page https://www.flashscore.fr/football/france/ligue-1/ nécessite le rendu JS
  return [];
}
