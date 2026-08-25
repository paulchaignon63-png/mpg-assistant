/**
 * Scraper Eurosport - calendrier Ligue 1
 * https://www.eurosport.fr/football/ligue-1/
 *
 * Fallback : page peut être géo-restreinte.
 * Les horaires de la page sont en heure de Paris (cf. lib/paris-time).
 */

import * as cheerio from "cheerio";
import { fetchHtml } from "../base-scraper";
import { parisDateToUtc } from "../../paris-time";

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

interface FrenchDateParts {
  year: number;
  month: number; // 1-indexé
  day: number;
}

function parseFrenchDate(text: string): FrenchDateParts | null {
  const match = text.match(
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i
  );
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS_FR[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  if (!month || day < 1 || day > 31) return null;
  return { year, month, day };
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
    let currentDate: FrenchDateParts | null = null;

    const text = $("body").text();
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

    // On retient le coup d'envoi à venir le plus proche, quel que soit
    // l'ordre d'affichage des dates sur la page.
    let firstMatchDate: Date | null = null;

    for (const line of lines) {
      const d = parseFrenchDate(line);
      if (d) {
        currentDate = d;
        continue;
      }

      if (!currentDate) continue;

      const t = parseTime(line);
      if (!t) continue;

      const kickoff = parisDateToUtc(
        currentDate.year,
        currentDate.month,
        currentDate.day,
        t.hours,
        t.minutes
      );
      if (kickoff <= now) continue;
      if (!firstMatchDate || kickoff < firstMatchDate) firstMatchDate = kickoff;
    }

    return firstMatchDate ? { firstMatchDate } : null;
  } catch {
    return null;
  }
}
