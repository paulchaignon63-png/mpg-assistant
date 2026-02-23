/**
 * Scraper RSS - flux foot FR/EN (RMC, BBC, etc.)
 * Parse XML et convertit en ScrapedNewsItem
 */

import type { ScrapedNewsItem } from "@/types/scraped";
import { fetchWithRetry } from "../base-scraper";
import { extractClubMentions, getLeagueConfig, newsMatchesLeague } from "@/lib/league-config";

const RSS_FEEDS: Array<{ id: string; url: string; lang: string }> = [
  { id: "rmc_football", url: "https://rmcsport.bfmtv.com/rss/football/", lang: "fr" },
  { id: "rmc_ligue1", url: "https://rmcsport.bfmtv.com/rss/football/ligue-1/", lang: "fr" },
  { id: "rmc_mercato", url: "https://rmcsport.bfmtv.com/rss/football/transferts/", lang: "fr" },
  { id: "bbc_football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", lang: "en" },
  { id: "bbc_pl", url: "https://feeds.bbci.co.uk/sport/football/premier-league/scores-fixtures", lang: "en" },
  { id: "rmc_general", url: "https://rmc.bfmtv.com/rss/", lang: "fr" },
];

function extractText(content: string): string {
  return content
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPlayerNames(text: string): string[] {
  const names: string[] = [];
  const parts = text.split(/[,;:]|\bet\b|\bfor\b|\bpour\b|\band\b|\bet\b/i);
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed.length >= 4 && trimmed.length <= 40 && /^[A-Za-zÀ-ÿ\s\-']+$/.test(trimmed)) {
      names.push(trimmed);
    }
  }
  return names.filter((n) => n.length > 0);
}

function guessType(title: string, description?: string): ScrapedNewsItem["type"] {
  const t = (title + " " + (description ?? "")).toLowerCase();
  if (
    t.includes("bless") ||
    t.includes("injury") ||
    t.includes("injuries") ||
    t.includes("absence") ||
    t.includes("forfait") ||
    t.includes("carried off") ||
    t.includes("stretcher")
  )
    return "injury";
  if (
    t.includes("susp") ||
    t.includes("carton") ||
    t.includes("rouge") ||
    t.includes("jaune") ||
    t.includes("exclus") ||
    t.includes("red card") ||
    t.includes("sent off")
  )
    return "suspension";
  if (
    t.includes("transfert") ||
    t.includes("prêt") ||
    t.includes("signe") ||
    t.includes("arrivée") ||
    t.includes("départ") ||
    t.includes("transfer") ||
    t.includes("signing") ||
    t.includes("gossip") ||
    t.includes("mercato")
  )
    return "transfer";
  if (
    t.includes("équipe type") ||
    t.includes("compo") ||
    t.includes("titulaire") ||
    t.includes("lineup")
  )
    return "lineup";
  if (t.includes("forme") || t.includes("régulier") || t.includes("form")) return "form";
  return "other";
}

function parseRssItems(
  xml: string,
  sourceId: string,
  maxItems: number,
  options?: { championshipId?: number | string }
): ScrapedNewsItem[] {
  const items: ScrapedNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  const seen = new Set<string>();
  const config = getLeagueConfig(options?.championshipId);

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
    const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
    const pubMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    const title = titleMatch ? extractText(titleMatch[1]) : "";
    const link = linkMatch ? extractText(linkMatch[1]) : "";
    const description = descMatch ? extractText(descMatch[1]) : "";
    const pubDate = pubMatch ? extractText(pubMatch[1]) : "";
    const fullText = title + " " + description;

    if (!title || title.length < 10) continue;

    if (options?.championshipId && !newsMatchesLeague(fullText, config)) continue;

    const id = link || title;
    if (seen.has(id)) continue;
    seen.add(id);

    const type = guessType(title, description);
    const playerNames = extractPlayerNames(fullText);
    const clubNames = extractClubMentions(fullText, config);

    items.push({
      source: "rss_foot",
      title,
      excerpt: description || undefined,
      url: link || undefined,
      publishedAt: pubDate || undefined,
      playerNames: playerNames.length > 0 ? playerNames : undefined,
      clubNames: clubNames.length > 0 ? clubNames : undefined,
      type,
      confidence: playerNames.length > 0 ? 0.8 : 0.5,
    });
  }

  return items;
}

/**
 * Récupère et parse un flux RSS
 */
export async function parseRssFeed(
  url: string,
  options?: { maxItems?: number; championshipId?: number | string }
): Promise<ScrapedNewsItem[]> {
  const { maxItems = 20, championshipId } = options ?? {};
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status} ${url}`);
  const xml = await res.text();
  return parseRssItems(xml, url, maxItems, { championshipId });
}

/**
 * Récupère tous les flux RSS configurés (filtrés par championnat si fourni)
 */
export async function scrapeRssFeeds(options?: {
  maxItemsPerFeed?: number;
  feeds?: Array<{ id: string; url: string; lang: string }>;
  championshipId?: number | string;
}): Promise<ScrapedNewsItem[]> {
  const { maxItemsPerFeed = 15, championshipId } = options ?? {};
  const config = getLeagueConfig(championshipId);
  const rssFeedIds = config.rssFeedIds;
  const allFeeds = options?.feeds ?? RSS_FEEDS;
  const feeds =
    rssFeedIds && rssFeedIds.length > 0
      ? allFeeds.filter((f) => rssFeedIds.includes(f.id))
      : allFeeds;

  const allItems: ScrapedNewsItem[] = [];
  const seenUrls = new Set<string>();

  for (const feed of feeds) {
    try {
      const items = await parseRssFeed(feed.url, {
        maxItems: maxItemsPerFeed,
        championshipId,
      });
      for (const item of items) {
        const key = item.url ?? item.title;
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          allItems.push(item);
        }
      }
    } catch (err) {
      console.warn(
        "[scrapers] RSS feed failed:",
        feed.id,
        err instanceof Error ? err.message : err
      );
    }
  }

  return allItems;
}
