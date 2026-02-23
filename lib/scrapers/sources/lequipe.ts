/**
 * Scraper L'Equipe - actualités foot, blessures, suspensions
 * https://www.lequipe.fr/Football/
 */

import * as cheerio from "cheerio";
import type { ScrapedNewsItem } from "@/types/scraped";
import { fetchHtml } from "../base-scraper";
import { extractClubMentions, getLeagueConfig, newsMatchesLeague } from "@/lib/league-config";

const L1_NEWS_URL = "https://www.lequipe.fr/Football/Ligue-1/";
const FOOT_ACTU_URL = "https://www.lequipe.fr/Football/";

function extractPlayerNames(text: string): string[] {
  const names: string[] = [];
  const parts = text.split(/[,;:]|\bet\b|\bfor\b|\bpour\b/i);
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed.length >= 4 && trimmed.length <= 40 && /^[A-Za-zÀ-ÿ\s\-']+$/.test(trimmed)) {
      names.push(trimmed);
    }
  }
  return names.filter((n) => n.length > 0);
}

function guessType(title: string): ScrapedNewsItem["type"] {
  const t = title.toLowerCase();
  if (
    t.includes("bless") ||
    t.includes("injury") ||
    t.includes("absence") ||
    t.includes("forfait")
  )
    return "injury";
  if (
    t.includes("susp") ||
    t.includes("carton") ||
    t.includes("rouge") ||
    t.includes("jaune") ||
    t.includes("exclus")
  )
    return "suspension";
  if (
    t.includes("transfert") ||
    t.includes("prêt") ||
    t.includes("signe") ||
    t.includes("arrivée") ||
    t.includes("départ")
  )
    return "transfer";
  if (t.includes("équipe type") || t.includes("compo") || t.includes("titulaire"))
    return "lineup";
  if (t.includes("forme") || t.includes("régulier")) return "form";
  return "other";
}

export async function scrapeLequipe(options?: {
  maxItems?: number;
  league?: "ligue1" | "all";
  championshipId?: number | string;
}): Promise<ScrapedNewsItem[]> {
  const { maxItems = 30, league = "ligue1", championshipId } = options ?? {};
  const url = league === "ligue1" ? L1_NEWS_URL : FOOT_ACTU_URL;
  const config = getLeagueConfig(championshipId);

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const items: ScrapedNewsItem[] = [];
  const seen = new Set<string>();

  // Structure L'Equipe : h2 (titre) suivi d'un lien [Foot,Ligue 1,...](url)
  $("h2").each((_, h2) => {
    if (items.length >= maxItems) return false;
    const $h2 = $(h2);
    const title = $h2.text().trim();
    let $link = $h2.next("a").first();
    if ($link.length === 0) {
      const $parent = $h2.parent();
      $link = $parent.find("a[href*='/Football/'], a[href*='/Article/'], a[href*='/Actualites/']").first();
    }
    const href = $link.attr("href");
    if (!href || !title || title.length < 10) return;

    const fullUrl = href.startsWith("http") ? href : `https://www.lequipe.fr${href}`;
    const id = fullUrl.split("/").pop() ?? fullUrl;
    if (seen.has(id)) return;
    seen.add(id);

    if (league === "all" && championshipId && !newsMatchesLeague(title, config)) return;

    const type = guessType(title);
    const playerNames = extractPlayerNames(title);
    const clubNames = extractClubMentions(title, config);

    items.push({
      source: "lequipe",
      title,
      url: fullUrl,
      playerNames: playerNames.length > 0 ? playerNames : undefined,
      clubNames: clubNames.length > 0 ? clubNames : undefined,
      type,
      confidence: playerNames.length > 0 ? 0.8 : 0.5,
    });
  });

  // Fallback : liens directs si pas de h2
  if (items.length === 0) {
    $("a[href*='/Football/Article/'], a[href*='/Football/Actualites/']").each((_, el) => {
      if (items.length >= maxItems) return false;
      const $el = $(el);
      const href = $el.attr("href");
      const title = $el.text().trim();
      if (!href || !title || title.length < 15 || title.includes(",")) return;
      const fullUrl = href.startsWith("http") ? href : `https://www.lequipe.fr${href}`;
      const id = fullUrl.split("/").pop() ?? fullUrl;
      if (seen.has(id)) return;
      seen.add(id);
      items.push({
        source: "lequipe",
        title,
        url: fullUrl,
        type: guessType(title),
        confidence: 0.5,
      });
    });
  }

  return items;
}
