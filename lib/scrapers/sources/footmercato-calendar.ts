/**
 * Scraper Foot Mercato - calendrier des matchs par championnat
 * https://www.footmercato.net/france/ligue-1/calendrier/
 *
 * Extrait la date/heure du premier match de la prochaine journée.
 */

import * as cheerio from "cheerio";
import { fetchHtml } from "../base-scraper";

/** championshipId MPG → chemin Foot Mercato (pays/ligue) */
const CHAMP_TO_FOOTMERCATO: Record<string, string> = {
  "1": "france/ligue-1",
  LIGUE_1: "france/ligue-1",
  "2": "england/premier-league",
  PREMIER_LEAGUE: "england/premier-league",
  "3": "spain/laliga",
  LIGA: "spain/laliga",
  "4": "france/ligue-2",
  LIGUE_2: "france/ligue-2",
  "5": "italy/serie-a",
  SERIE_A: "italy/serie-a",
  "7": "turkey/super-lig",
  LIGUE_SUPER: "turkey/super-lig",
};

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

function getCalendarUrl(championshipId: number | string): string | null {
  const key = String(championshipId).trim();
  const path = CHAMP_TO_FOOTMERCATO[key];
  if (!path) return null;
  return `https://www.footmercato.net/${path}/calendrier/`;
}

/**
 * Parse une date française "vendredi 27 février 2026"
 */
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

/**
 * Parse une heure "20:45" ou "21:05"
 */
function parseTime(text: string): { hours: number; minutes: number } | null {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export interface FootMercatoMatchdayResult {
  firstMatchDate: Date;
  gameWeek?: number;
}

/**
 * Récupère la date du premier match de la prochaine journée depuis Foot Mercato.
 */
export async function scrapeFootMercatoNextMatchday(
  championshipId: number | string
): Promise<FootMercatoMatchdayResult | null> {
  const url = getCalendarUrl(championshipId);
  if (!url) return null;

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const now = new Date();
    let currentDate: Date | null = null;
    let firstMatchTime: { hours: number; minutes: number } | null = null;
    let gameWeek: number | undefined;

    const bodyText = $("body").text();
    const lines = bodyText.split(/\n/).map((l) => l.trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const jMatch = line.match(/journée\s+(\d+)/i);
      if (jMatch) gameWeek = parseInt(jMatch[1], 10);

      const parsedDate = parseFrenchDate(line);
      if (parsedDate && parsedDate >= now) {
        currentDate = parsedDate;
      }

      // Ignorer les lignes de cotes (Bonus, N 3.55, etc.)
      if (line.includes("Bonus") || /^\d+\s+[\d.]+\s+[N\d.]+\s+[\d.]+/.test(line)) continue;

      const timeMatch = parseTime(line);
      if (timeMatch && currentDate) {
        firstMatchTime = timeMatch;
        break;
      }
    }

    if (!firstMatchTime && currentDate) {
      $('a[href*="/live/"]').each((_, el) => {
        if (firstMatchTime) return false;
        const text = $(el).text().trim();
        if (text.includes("Bonus")) return;
        const time = parseTime(text);
        if (time) {
          firstMatchTime = time;
          return false;
        }
      });
    }

    if (!currentDate || !firstMatchTime) return null;

    const firstMatchDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
      firstMatchTime.hours,
      firstMatchTime.minutes,
      0,
      0
    );

    if (firstMatchDate <= now) return null;

    return {
      firstMatchDate,
      gameWeek,
    };
  } catch {
    return null;
  }
}
