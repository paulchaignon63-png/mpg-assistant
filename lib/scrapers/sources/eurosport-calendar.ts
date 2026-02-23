/**
 * Scraper Eurosport - calendrier Ligue 1
 * https://www.eurosport.fr/football/ligue-1/
 *
 * Fallback : page peut être géo-restreinte.
 */

import * as cheerio from "cheerio";
import { fetchHtml } from "../base-scraper";

const MONTHS_FR: Record<string, number> = {
  janvier: 1,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
};

/** championshipId MPG → URL Eurosport */
const CHAMP_TO_URL: Record<string, string> = {
  "1": "https://www.eurosport.fr/football/ligue-1/",
  LIGUE_1: "https://www.eurosport.fr/football/ligue-1/",
  "2": "https://www.eurosport.fr/football/premier-league/",
  PREMIER_LEAGUE: "https://www.eurosport.fr/football/premier-league/",
};

export interface EurosportCalendarResult {
  firstMatchDate: Date;
  gameWeek?: number;
}

function parseFrenchDate(text: string): Date | null {
  const match = text.match(
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i
  );
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS_FR[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  if (!month || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

function parseTime(text: string): { hours: number; minutes: number } | null {
  const m = text.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hours: h, minutes: min };
}

/**
 * Fallback Eurosport - peut être géo-restreint.
 */
export async function scrapeEurosportNextMatchday(
  championshipId: number | string
): Promise<EurosportCalendarResult | null> {
  const url = CHAMP_TO_URL[String(championshipId).trim()];
  if (!url) return null;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const now = new Date();
    let currentDate: Date | null = null;
    let firstTime: { hours: number; minutes: number } | null = null;

    const text = $("body").text();
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const d = parseFrenchDate(line);
      if (d && d >= now) currentDate = d;

      const t = parseTime(line);
      if (t && currentDate) {
        firstTime = t;
        break;
      }
    }

    if (!currentDate || !firstTime) return null;

    const firstMatchDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
      firstTime.hours,
      firstTime.minutes,
      0,
      0
    );

    return firstMatchDate > now ? { firstMatchDate } : null;
  } catch {
    return null;
  }
}
