/**
 * Agrégateur - lance tous les scrapers et fusionne les résultats
 *
 * Fallback MPGStats / API-Football = Transfermarkt + Sofascore uniquement.
 * Voir lib/sources-fallback.ts
 */

import type { ScrapedDataAggregate, ScrapeSource } from "@/types/scraped";
import { scrapeLequipe } from "./sources/lequipe";
import { scrapeTransfermarktInjuries, scrapeTransfermarktTransfers } from "./sources/transfermarkt";
import { scrapeFlashscore } from "./sources/flashscore";
import { scrapeSofascoreInjuries } from "./sources/sofascore";
import { scrapeEurosport } from "./sources/eurosport";
import { scrapeRssFeeds } from "./sources/rss-feeds";

export interface AggregatorOptions {
  /** Activer Transfermarkt (ToS restrictif) */
  transfermarkt?: boolean;
  /** Activer L'Equipe */
  lequipe?: boolean;
  /** Activer Eurosport */
  eurosport?: boolean;
  /** Activer flux RSS (RMC, BBC, etc.) */
  rss?: boolean;
  /** Max items par source news */
  maxNewsPerSource?: number;
  /** Championnat MPG (1=L1, 2=PL, etc.) - filtre news/RSS par ligue */
  championshipId?: number | string;
  /** Mode fallback : uniquement Transfermarkt + Sofascore (pas L'Equipe, Eurosport, RSS) */
  fallbackSourcesOnly?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<AggregatorOptions, "championshipId">> = {
  transfermarkt: true,
  lequipe: true,
  eurosport: true,
  rss: true,
  maxNewsPerSource: 25,
  fallbackSourcesOnly: false,
};

export async function aggregateScrapedData(
  options: AggregatorOptions = {}
): Promise<ScrapedDataAggregate> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const championshipId = options.championshipId;
  const news: ScrapedDataAggregate["news"] = [];
  const injuries: ScrapedDataAggregate["injuries"] = [];
  const transfers: ScrapedDataAggregate["transfers"] = [];
  const suspensions: ScrapedDataAggregate["suspensions"] = [];
  const sourcesOk: ScrapeSource[] = [];
  const sourcesFailed: ScrapeSource[] = [];

  const useFallbackOnly = opts.fallbackSourcesOnly;

  if (opts.lequipe && !useFallbackOnly) {
    try {
      const league = championshipId && ["1", "4", "LIGUE_1", "LIGUE_2"].includes(String(championshipId))
        ? "ligue1"
        : "all";
      const items = await scrapeLequipe({
        maxItems: opts.maxNewsPerSource,
        league,
        championshipId,
      });
      news.push(...items);
      sourcesOk.push("lequipe");
    } catch (err) {
      sourcesFailed.push("lequipe");
    }
  }

  if (opts.eurosport && !useFallbackOnly) {
    try {
      const items = await scrapeEurosport({
        maxItems: opts.maxNewsPerSource,
        championshipId,
      });
      news.push(...items);
      sourcesOk.push("eurosport");
    } catch (err) {
      sourcesFailed.push("eurosport");
    }
  }

  if (opts.rss && !useFallbackOnly) {
    try {
      const items = await scrapeRssFeeds({
        maxItemsPerFeed: Math.min(15, opts.maxNewsPerSource),
        championshipId,
      });
      const seenKey = new Set<string>();
      for (const item of items) {
        const key = (item.url ?? item.title).toLowerCase().trim();
        if (!seenKey.has(key)) {
          seenKey.add(key);
          news.push(item);
        }
      }
      sourcesOk.push("rss_foot");
    } catch (err) {
      sourcesFailed.push("rss_foot");
    }
  }

  if (opts.transfermarkt) {
    try {
      const inj = await scrapeTransfermarktInjuries({ championshipId });
      injuries.push(...inj);
      const tr = await scrapeTransfermarktTransfers({ championshipId });
      transfers.push(...tr);
      sourcesOk.push("transfermarkt");
    } catch (err) {
      sourcesFailed.push("transfermarkt");
    }
  }

  // Flashscore, Sofascore : stubs pour l'instant
  try {
    await scrapeFlashscore();
    sourcesOk.push("flashscore");
  } catch {
    sourcesFailed.push("flashscore");
  }
  try {
    await scrapeSofascoreInjuries();
    sourcesOk.push("sofascore");
  } catch {
    sourcesFailed.push("sofascore");
  }

  return {
    news,
    injuries,
    transfers,
    suspensions: suspensions.length > 0 ? suspensions : undefined,
    scrapedAt: new Date().toISOString(),
    sourcesOk,
    sourcesFailed,
  };
}
