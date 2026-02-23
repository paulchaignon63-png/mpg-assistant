/**
 * Module Scraping - enrichissement du pool MPG
 *
 * Sources : L'Equipe, Transfermarkt, Eurosport, Flashscore, Sofascore
 *
 * ATTENTION LEGALE :
 * - Vérifier les Conditions d'utilisation de chaque site avant déploiement
 * - Respecter robots.txt, rate-limiting, user-agent
 * - Certains sites (ex. Transfermarkt) interdisent explicitement le scraping
 * - Usage personnel / éducatif recommandé
 */

export { aggregateScrapedData } from "./aggregator";
export type { AggregatorOptions } from "./aggregator";
export { fetchWithRetry, fetchHtml } from "./base-scraper";
export { scrapeLequipe } from "./sources/lequipe";
export { scrapeTransfermarktInjuries, scrapeTransfermarktTransfers } from "./sources/transfermarkt";
export { scrapeEurosport } from "./sources/eurosport";
export { scrapeFlashscore } from "./sources/flashscore";
export { scrapeSofascoreInjuries } from "./sources/sofascore";
export { scrapeRssFeeds, parseRssFeed } from "./sources/rss-feeds";
export type { ScrapedDataAggregate, ScrapedNewsItem, ScrapedInjury, ScrapedTransfer } from "@/types/scraped";
