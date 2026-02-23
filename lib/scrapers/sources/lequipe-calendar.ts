/**
 * Scraper L'Equipe - tentative d'extraction de dates de matchs
 * https://www.lequipe.fr/Football/Ligue-1/
 *
 * Fallback : L'Equipe n'a pas de calendrier structuré type fixtures.
 * On cherche des patterns de date dans les articles (ex. "17 août", "week-end du 3 janvier").
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

/** championshipId MPG → section L'Equipe */
const CHAMP_TO_URL: Record<string, string> = {
  "1": "https://www.lequipe.fr/Football/Ligue-1/",
  LIGUE_1: "https://www.lequipe.fr/Football/Ligue-1/",
  "2": "https://www.lequipe.fr/Football/Premier-League/",
  PREMIER_LEAGUE: "https://www.lequipe.fr/Football/Premier-League/",
  "4": "https://www.lequipe.fr/Football/Ligue-2/",
  LIGUE_2: "https://www.lequipe.fr/Football/Ligue-2/",
};

export interface LequipeCalendarResult {
  firstMatchDate: Date;
  gameWeek?: number;
}

function parseDateFromMatch(
  match: RegExpMatchArray,
  monthKey: string,
  defaultHour: number
): Date | null {
  const day = parseInt(match[1], 10);
  const month = MONTHS_FR[monthKey.toLowerCase()];
  const year = parseInt(match[3], 10);
  if (month && day >= 1 && day <= 31) {
    return new Date(year, month - 1, day, defaultHour, 0, 0);
  }
  return null;
}

/**
 * Cherche la première date future dans le texte.
 */
function findNextMatchDate(text: string, now: Date): Date | null {
  let earliest: Date | null = null;

  // "week-end du 3 janvier 2026"
  const weekEndRe = /week-end\s+du\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi;
  let match: RegExpMatchArray | null;
  while ((match = weekEndRe.exec(text)) !== null) {
    const d = parseDateFromMatch(match, match[2], 20);
    if (d && d > now && (!earliest || d < earliest)) earliest = d;
  }

  // "17 août 2025" ou "3 janvier 2026"
  const simpleRe = /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi;
  while ((match = simpleRe.exec(text)) !== null) {
    const d = parseDateFromMatch(match, match[2], 20);
    if (d && d > now && (!earliest || d < earliest)) earliest = d;
  }

  return earliest;
}

/**
 * Fallback L'Equipe - extraction faible, peu fiable.
 */
export async function scrapeLequipeNextMatchday(
  championshipId: number | string
): Promise<LequipeCalendarResult | null> {
  const url = CHAMP_TO_URL[String(championshipId).trim()];
  if (!url) return null;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const text = $("body").text();
    const now = new Date();

    const date = findNextMatchDate(text, now);
    if (date) {
      return { firstMatchDate: date };
    }
    return null;
  } catch {
    return null;
  }
}
