/**
 * Scraper Eurosport - actualités foot FR/EN
 * https://www.eurosport.fr/football/
 */

import * as cheerio from "cheerio";
import type { ScrapedNewsItem } from "@/types/scraped";
import { fetchHtml } from "../base-scraper";
import { extractClubMentions, getLeagueConfig, newsMatchesLeague } from "@/lib/league-config";

const EUROSPORT_FOOT_URL = "https://www.eurosport.fr/football/";

function guessType(title: string): ScrapedNewsItem["type"] {
  const t = title.toLowerCase();
  if (t.includes("bless") || t.includes("injury") || t.includes("absence")) return "injury";
  if (t.includes("susp") || t.includes("carton") || t.includes("rouge")) return "suspension";
  if (t.includes("transfert") || t.includes("prêt") || t.includes("signe")) return "transfer";
  return "other";
}

function extractPlayerNames(text: string): string[] {
  const names: string[] = [];
  const parts = text.split(/[,;:]|\bet\b|\bfor\b|\bpour\b/i);
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed.length >= 4 && trimmed.length <= 40 && /^[A-Za-zÀ-ÿ\s\-']+$/.test(trimmed)) names.push(trimmed);
  }
  return names.filter((n) => n.length > 0);
}

export async function scrapeEurosport(options?: {
  maxItems?: number;
  championshipId?: number | string;
}): Promise<ScrapedNewsItem[]> {
  const { maxItems = 20, championshipId } = options ?? {};
  const config = getLeagueConfig(championshipId);

  try {
    const html = await fetchHtml(EUROSPORT_FOOT_URL);
    const $ = cheerio.load(html);

    const items: ScrapedNewsItem[] = [];
    const seen = new Set<string>();

    $("a[href*='/football/']").each((_, el) => {
      if (items.length >= maxItems) return false;
      const $el = $(el);
      const href = $el.attr("href");
      const title = $el.find("span, h2, h3").first().text().trim() || $el.text().trim();
      if (!href || !title || title.length < 15) return;

      if (championshipId && !newsMatchesLeague(title, config)) return;

      const fullUrl = href.startsWith("http") ? href : `https://www.eurosport.fr${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const playerNames = extractPlayerNames(title);
      const clubNames = extractClubMentions(title, config);

      items.push({
        source: "eurosport",
        title,
        url: fullUrl,
        playerNames: playerNames.length > 0 ? playerNames : undefined,
        clubNames: clubNames.length > 0 ? clubNames : undefined,
        type: guessType(title),
        confidence: playerNames.length > 0 ? 0.8 : 0.5,
      });
    });

    return items;
  } catch (err) {
    console.warn("[scrapers] Eurosport failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
