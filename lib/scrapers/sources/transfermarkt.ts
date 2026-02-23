/**
 * Scraper Transfermarkt - blessures, transferts, valeurs
 * https://www.transfermarkt.fr/
 *
 * Extrait le maximum d'infos : ID joueur, position, âge, nationalité, valeur, dates
 *
 * ATTENTION: Transfermarkt protège fortement contre le scraping.
 * Utiliser avec parcimonie, respecter les ToS, prévoir rotation IP/proxy en prod.
 */

import * as cheerio from "cheerio";
import type { ScrapedInjury, ScrapedTransfer, ScrapedSuspension } from "@/types/scraped";
import { fetchHtml } from "../base-scraper";
import { getLeagueConfig } from "@/lib/league-config";

/** Mapping code TM → slug URL (transfermarkt.com) */
const TM_LEAGUE_SLUG: Record<string, string> = {
  FR1: "ligue-1",
  GB1: "premier-league",
  ES1: "laliga",
  IT1: "serie-a",
  FR2: "ligue-2",
  L1: "1-bundesliga",
  CL: "champions-league",
  TR1: "super-lig",
};

function parsePosition(txt: string): string | undefined {
  const t = txt.toLowerCase();
  if (t.includes("goalkeeper") || t.includes("gardien") || t.includes("torwart")) return "G";
  if (t.includes("back") || t.includes("centre-back") || t.includes("defender") || t.includes("défenseur")) return "D";
  if (t.includes("midfield") || t.includes("midfield") || t.includes("milieu") || t.includes("mittelfeld")) return "M";
  if (t.includes("forward") || t.includes("winger") || t.includes("attaquant") || t.includes("stürmer")) return "A";
  return undefined;
}

function extractPlayerId(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const m = href.match(/spieler\/(\d+)/i) || href.match(/profil\/spieler\/(\d+)/i);
  return m ? m[1] : undefined;
}

function parseValue(txt: string): string | undefined {
  const m = txt.match(/[\d,.]+[km]?/i);
  return m ? m[0].trim() : undefined;
}

export async function scrapeTransfermarktInjuries(options?: {
  championshipId?: number | string;
}): Promise<ScrapedInjury[]> {
  const config = getLeagueConfig(options?.championshipId);
  const slug = TM_LEAGUE_SLUG[config.tmLeague] ?? "ligue-1";
  const url = `https://www.transfermarkt.com/${slug}/verletztespieler/wettbewerb/${config.tmLeague}`;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const injuries: ScrapedInjury[] = [];
    const rows = $("table.items tbody tr, table.auflistung tbody tr").toArray();

    for (const tr of rows) {
      const $tr = $(tr);
      const $playerLink = $tr.find("a[href*='/spieler/'], a[href*='profil/spieler']").first();
      const playerName = $playerLink.text().trim();
      const href = $playerLink.attr("href");

      if (!playerName) continue;

      const playerId = extractPlayerId(href);
      const $clubLink = $tr.find("a[href*='/verein/']").first();
      const clubName = $clubLink.text().trim() || undefined;

      const $cells = $tr.find("td");
      let reason: string | undefined;
      let returnDate: string | undefined;
      let injurySince: string | undefined;
      let position: string | undefined;
      let age: number | undefined;
      let nationality: string | undefined;
      let marketValue: string | undefined;
      const dates: string[] = [];

      $cells.each((_, td) => {
        const text = $(td).text().trim();
        const $img = $(td).find("img[title]");
        if ($img.length && !nationality) nationality = $img.first().attr("title") || undefined;
        if (/^\d{1,2}$/.test(text)) {
          const n = parseInt(text, 10);
          if (n >= 16 && n <= 45 && !age) age = n;
        }
        const dateMatch = text.match(/\d{2}[\/.]\d{2}[\/.]\d{2,4}/);
        if (dateMatch) dates.push(text);
        const valMatch = parseValue(text);
        if (valMatch && text.includes("€") && !marketValue) marketValue = valMatch;
        const injuryKeywords = ["injury", "blessure", "muscle", "knee", "ankle", "calf", "hamstring", "cruciate", "fracture", "sprain", "tear", "problems"];
        if (injuryKeywords.some((k) => text.toLowerCase().includes(k)) && text.length < 80) reason = text;
      });

      if (dates.length >= 1) returnDate = dates[0];
      if (dates.length >= 2) injurySince = dates[1];

      const $posCell = $tr.find("td:first-child");
      const posText = $posCell.text();
      if (posText && !position) position = parsePosition(posText) ?? undefined;

      if (!reason) {
        $cells.slice(2).each((_, td) => {
          const t = $(td).text().trim();
          if (t.length > 3 && t.length < 60 && !t.match(/^\d+$/) && !t.match(/^€[\d,.]/)) reason = t;
        });
      }
      const $valueTd = $tr.find("td.rechts");
      if (!marketValue && $valueTd.length) marketValue = parseValue($valueTd.last().text()) || undefined;

      const isDoubtful =
        (reason ?? "").toLowerCase().includes("doute") ||
        (reason ?? "").toLowerCase().includes("?") ||
        (reason ?? "").toLowerCase().includes("doubtful") ||
        (reason ?? "").toLowerCase().includes("fitness");

      injuries.push({
        source: "transfermarkt",
        playerName,
        playerId,
        clubName: clubName || undefined,
        reason: reason || undefined,
        returnDate: returnDate && returnDate.length < 20 ? returnDate : undefined,
        injurySince: injurySince && injurySince.length < 20 ? injurySince : undefined,
        status: isDoubtful ? "doubtful" : "out",
        position: position || undefined,
        age: age || undefined,
        nationality: nationality || undefined,
        marketValue: marketValue || undefined,
      });
    }

    return injuries;
  } catch (err) {
    console.warn("[scrapers] Transfermarkt injuries failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function scrapeTransfermarktTransfers(options?: {
  championshipId?: number | string;
}): Promise<ScrapedTransfer[]> {
  const config = getLeagueConfig(options?.championshipId);
  const slug = TM_LEAGUE_SLUG[config.tmLeague] ?? "ligue-1";
  const url = `https://www.transfermarkt.com/${slug}/letztetransfers/wettbewerb/${config.tmLeague}`;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const transfers: ScrapedTransfer[] = [];
    const rows = $("table.items tbody tr, table.auflistung tbody tr").toArray();

    for (const tr of rows) {
      const $tr = $(tr);
      const $playerLink = $tr.find("a[href*='/spieler/'], a[href*='profil/spieler']").first();
      const playerName = $playerLink.text().trim();
      const href = $playerLink.attr("href");

      if (!playerName) continue;

      const playerId = extractPlayerId(href);
      const $verein = $tr.find(".vereinprofil_tooltip, a[href*='/verein/']");
      const fromEl = $verein.first();
      const toEl = $verein.last();
      const fromClub = fromEl.text().trim() || undefined;
      const toClub = toEl.length > 1 ? toEl.last().text().trim() : undefined;

      let fee: string | undefined;
      let transferType: "loan" | "free" | "purchase" | undefined;
      let date: string | undefined;
      let position: string | undefined;
      let age: number | undefined;
      let nationality: string | undefined;
      let marketValue: string | undefined;

      $tr.find("td").each((_, td) => {
        const text = $(td).text().trim();
        if (text.match(/free|libre|gratuit|ablösefrei/i)) transferType = "free";
        if (text.match(/loan|prêt|leihe/i)) transferType = "loan";
        if (text.match(/€|million|mio|k\s*$/i)) {
          if (!fee && text.match(/[\d,.]/)) fee = parseValue(text) || text;
          else if (!marketValue) marketValue = parseValue(text) || undefined;
        }
        if (text.match(/\d{2}[\/.]\d{2}[\/.]\d{2,4}/)) date = text;
        if (/^\d{1,2}$/.test(text) && !age) {
          const n = parseInt(text, 10);
          if (n >= 16 && n <= 45) age = n;
        }
        const $img = $(td).find("img[title]");
        if ($img.length && !nationality) nationality = $img.first().attr("title") || undefined;
      });

      if (!transferType && fee) transferType = "purchase";

      transfers.push({
        source: "transfermarkt",
        playerName,
        playerId,
        fromClub: fromClub || undefined,
        toClub: toClub || undefined,
        type: transferType,
        date: date || undefined,
        fee: fee || undefined,
        marketValue: marketValue || undefined,
        position: position || undefined,
        age: age || undefined,
        nationality: nationality || undefined,
      });
    }

    return transfers;
  } catch (err) {
    console.warn("[scrapers] Transfermarkt transfers failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Scrape la page suspensions (sperrenausfaelle) Transfermarkt.
 * Retourne les joueurs suspendus (carton rouge, accumulation jaunes).
 */
export async function scrapeTransfermarktSuspensions(options?: {
  championshipId?: number | string;
}): Promise<ScrapedSuspension[]> {
  const config = getLeagueConfig(options?.championshipId);
  const slug = TM_LEAGUE_SLUG[config.tmLeague] ?? "ligue-1";
  const url = `https://www.transfermarkt.com/${slug}/sperrenausfaelle/wettbewerb/${config.tmLeague}`;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const suspensions: ScrapedSuspension[] = [];
    const rows = $("table.items tbody tr, table.auflistung tbody tr").toArray();

    for (const tr of rows) {
      const $tr = $(tr);
      const $playerLink = $tr.find("a[href*='/spieler/'], a[href*='profil/spieler']").first();
      const playerName = $playerLink.text().trim();
      const href = $playerLink.attr("href");

      if (!playerName) continue;

      const playerId = extractPlayerId(href);
      const $clubLink = $tr.find("a[href*='/verein/']").first();
      const clubName = $clubLink.text().trim() || undefined;

      let reason: string | undefined;
      let returnDate: string | undefined;

      $tr.find("td").each((_, td) => {
        const text = $(td).text().trim();
        const dateMatch = text.match(/\d{2}[\/.]\d{2}[\/.]\d{2,4}/);
        if (dateMatch) returnDate = text;
        if (
          text.length > 3 &&
          text.length < 80 &&
          !text.match(/^\d+$/) &&
          !text.match(/^€[\d,.]/) &&
          (text.toLowerCase().includes("card") ||
            text.toLowerCase().includes("gelb") ||
            text.toLowerCase().includes("rot") ||
            text.toLowerCase().includes("yellow") ||
            text.toLowerCase().includes("red") ||
            text.toLowerCase().includes("jaune") ||
            text.toLowerCase().includes("rouge") ||
            text.toLowerCase().includes("suspension") ||
            text.toLowerCase().includes("sperre"))
        ) {
          reason = text;
        }
      });

      suspensions.push({
        source: "transfermarkt",
        playerName,
        playerId,
        clubName: clubName || undefined,
        reason: reason || undefined,
        returnDate: returnDate && returnDate.length < 20 ? returnDate : undefined,
      });
    }

    return suspensions;
  } catch (err) {
    console.warn("[scrapers] Transfermarkt suspensions failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
