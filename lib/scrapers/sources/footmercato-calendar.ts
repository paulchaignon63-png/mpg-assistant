/**
 * Scraper Foot Mercato - calendrier des matchs par championnat
 * https://www.footmercato.net/france/ligue-1/calendrier/
 *
 * Extrait la date/heure du premier match de la prochaine journée.
 * Les horaires de la page sont en heure de Paris (cf. lib/paris-time).
 */

import * as cheerio from "cheerio";
import { fetchHtml } from "../base-scraper";
import { parisDateToUtc } from "../../paris-time";

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

/** Lignes de cotes de paris à ignorer (ex. "Bonus", "1 2.10 N 3.55 2 3.40") */
const ODDS_LINE_RE = /^\d+\s+[\d.]+\s+[N\d.]+\s+[\d.]+/;

function getCalendarUrl(championshipId: number | string): string | null {
  const key = String(championshipId).trim();
  const path = CHAMP_TO_FOOTMERCATO[key];
  if (!path) return null;
  return `https://www.footmercato.net/${path}/calendrier/`;
}

interface FrenchDateParts {
  year: number;
  month: number; // 1-indexé
  day: number;
}

interface DayTime {
  hours: number;
  minutes: number;
}

/** Un jour du calendrier : sa date et les horaires de coup d'envoi listés dessous. */
interface DayBlock {
  date: FrenchDateParts;
  times: DayTime[];
}

/**
 * Parse une date française "vendredi 27 février 2026"
 */
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

/**
 * Parse une heure "20:45" ou "21:05"
 */
function parseTime(text: string): DayTime | null {
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** Découpe le texte de la page en blocs "une date + ses horaires". */
function parseDayBlocks(lines: string[]): DayBlock[] {
  const blocks: DayBlock[] = [];
  let current: DayBlock | null = null;

  for (const line of lines) {
    const date = parseFrenchDate(line);
    if (date) {
      current = { date, times: [] };
      blocks.push(current);
      continue;
    }

    if (!current) continue;
    if (line.includes("Bonus") || ODDS_LINE_RE.test(line)) continue;

    const time = parseTime(line);
    if (time) current.times.push(time);
  }

  return blocks;
}

/**
 * Pas de `gameWeek` ici : la page répète "Journée N" à plusieurs endroits
 * (sélecteur de journée, calendrier de la saison) et le numéro relevé ne
 * correspondait pas à la journée à venir — on renvoyait "J34" fin août. Le
 * numéro de journée ne vient donc que des sources qui l'exposent de manière
 * structurée (Sofascore, MPG) ; l'UI n'affiche rien quand il est absent.
 */
export interface FootMercatoMatchdayResult {
  firstMatchDate: Date;
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
    const lines = $("body")
      .text()
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // On retient le coup d'envoi à venir le plus proche, quel que soit
    // l'ordre d'affichage des blocs sur la page.
    let best: FootMercatoMatchdayResult | null = null;

    for (const block of parseDayBlocks(lines)) {
      for (const time of block.times) {
        const kickoff = parisDateToUtc(
          block.date.year,
          block.date.month,
          block.date.day,
          time.hours,
          time.minutes
        );
        if (kickoff <= now) continue;
        if (!best || kickoff < best.firstMatchDate) {
          best = { firstMatchDate: kickoff };
        }
      }
    }

    return best;
  } catch {
    return null;
  }
}
