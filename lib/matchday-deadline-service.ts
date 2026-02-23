/**
 * Service de récupération de la deadline de composition MPG.
 * Orchestre les sources : MPG, Sofascore, Foot Mercato, L'Equipe, Eurosport.
 *
 * Deadline = début du 1er match de la journée - 5 minutes.
 */

import { getNextMatchdayFirstMatch } from "./sofascore-client";
import { scrapeFootMercatoNextMatchday } from "./scrapers/sources/footmercato-calendar";
import { scrapeLequipeNextMatchday } from "./scrapers/sources/lequipe-calendar";
import { scrapeEurosportNextMatchday } from "./scrapers/sources/eurosport-calendar";

export type DeadlineSource = "mpg" | "sofascore" | "footmercato" | "lequipe" | "eurosport";

export type BreakType = "winter" | "international" | "end_of_season" | "unknown";

export interface BreakStatus {
  type: BreakType;
  message: string;
  resumeDate?: Date;
}

export interface MatchdayDeadlineResult {
  deadline: Date;
  firstMatchDate: Date;
  gameWeek?: number;
  source: DeadlineSource;
}

export interface MatchdayDeadlineResponse {
  result: MatchdayDeadlineResult | null;
  breakStatus: BreakStatus | null;
}

const DEADLINE_OFFSET_MS = 5 * 60 * 1000; // 5 minutes avant le 1er match

/** Trêve hivernale L1/L2 : ~14 déc - ~3 jan */
const WINTER_BREAK_START_MONTH = 11; // décembre = 11 (0-indexed)
const WINTER_BREAK_END_MONTH = 0; // janvier

/** Fin de saison : mai-juillet */
const END_OF_SEASON_MONTHS = [4, 5, 6]; // mai, juin, juillet

/** Trêves internationales typiques : mars, octobre, novembre */
const INTERNATIONAL_BREAK_MONTHS = [2, 9, 10]; // mars, octobre, novembre

/**
 * Parse nextRealGameWeekDate de l'API MPG (format à valider : ISO ou timestamp).
 */
function parseMpgDate(value: string | undefined): Date | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ISO 8601
  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return new Date(iso);

  // Timestamp en secondes
  const ts = parseInt(trimmed, 10);
  if (!Number.isNaN(ts) && ts > 0) {
    return ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
  }

  return null;
}

/**
 * Récupère la deadline de composition pour une journée.
 * Essaie MPG (si fourni), puis Sofascore, puis Foot Mercato.
 */
export async function getMatchdayDeadline(
  championshipId: number | string,
  mpgNextRealGameWeekDate?: string
): Promise<MatchdayDeadlineResult | null> {
  const now = new Date();

  // 1. MPG nextRealGameWeekDate
  if (mpgNextRealGameWeekDate) {
    const mpgDate = parseMpgDate(mpgNextRealGameWeekDate);
    if (mpgDate && mpgDate > now) {
      const deadline = new Date(mpgDate.getTime() - DEADLINE_OFFSET_MS);
      return {
        deadline,
        firstMatchDate: mpgDate,
        source: "mpg",
      };
    }
  }

  // 2. Sofascore
  try {
    const sofascore = await getNextMatchdayFirstMatch(championshipId);
    if (sofascore) {
      const firstMatchDate = new Date(sofascore.firstMatchTimestamp * 1000);
      if (firstMatchDate > now) {
        const deadline = new Date(firstMatchDate.getTime() - DEADLINE_OFFSET_MS);
        return {
          deadline,
          firstMatchDate,
          gameWeek: sofascore.gameWeek,
          source: "sofascore",
        };
      }
    }
  } catch {
    // ignore, try next source
  }

  // 3. Foot Mercato
  try {
    const footMercato = await scrapeFootMercatoNextMatchday(championshipId);
    if (footMercato && footMercato.firstMatchDate > now) {
      const deadline = new Date(
        footMercato.firstMatchDate.getTime() - DEADLINE_OFFSET_MS
      );
      return {
        deadline,
        firstMatchDate: footMercato.firstMatchDate,
        gameWeek: footMercato.gameWeek,
        source: "footmercato",
      };
    }
  } catch {
    // ignore
  }

  // 4. L'Equipe (fallback)
  try {
    const lequipe = await scrapeLequipeNextMatchday(championshipId);
    if (lequipe && lequipe.firstMatchDate > now) {
      const deadline = new Date(lequipe.firstMatchDate.getTime() - DEADLINE_OFFSET_MS);
      return {
        deadline,
        firstMatchDate: lequipe.firstMatchDate,
        gameWeek: lequipe.gameWeek,
        source: "lequipe",
      };
    }
  } catch {
    // ignore
  }

  // 5. Eurosport (fallback)
  try {
    const eurosport = await scrapeEurosportNextMatchday(championshipId);
    if (eurosport && eurosport.firstMatchDate > now) {
      const deadline = new Date(eurosport.firstMatchDate.getTime() - DEADLINE_OFFSET_MS);
      return {
        deadline,
        firstMatchDate: eurosport.firstMatchDate,
        gameWeek: eurosport.gameWeek,
        source: "eurosport",
      };
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Détecte le type de pause quand aucune source ne retourne de match.
 */
function detectBreakStatus(championshipId: number | string): BreakStatus {
  const now = new Date();
  const month = now.getMonth();
  const champStr = String(championshipId);

  // Fin de saison (mai à juillet)
  if (END_OF_SEASON_MONTHS.includes(month)) {
    const resumeYear = month >= 5 ? now.getFullYear() + 1 : now.getFullYear();
    return {
      type: "end_of_season",
      message: "Fin de saison – reprise en août",
      resumeDate: new Date(resumeYear, 7, 15, 20, 0, 0),
    };
  }

  // Trêve hivernale (L1, L2 : mi-décembre à début janvier)
  const hasWinterBreak = ["1", "4", "LIGUE_1", "LIGUE_2"].includes(champStr);
  if (hasWinterBreak && (month === 11 || month === 0)) {
    const resumeDate = month === 11
      ? new Date(now.getFullYear() + 1, 0, 3, 20, 0, 0)
      : new Date(now.getFullYear(), 0, 3, 20, 0, 0);
    return {
      type: "winter",
      message: "Trêve hivernale – reprise début janvier",
      resumeDate,
    };
  }

  // Trêve internationale (mars, octobre, novembre)
  if (INTERNATIONAL_BREAK_MONTHS.includes(month)) {
    return {
      type: "international",
      message: "Trêve internationale – reprise prochain week-end",
    };
  }

  return {
    type: "unknown",
    message: "Prochaine journée non disponible",
  };
}

/**
 * Récupère la deadline ou le statut de pause.
 */
export async function getMatchdayDeadlineWithBreakStatus(
  championshipId: number | string,
  mpgNextRealGameWeekDate?: string
): Promise<MatchdayDeadlineResponse> {
  const result = await getMatchdayDeadline(championshipId, mpgNextRealGameWeekDate);

  if (result) {
    return { result, breakStatus: null };
  }

  const breakStatus = detectBreakStatus(championshipId);
  return { result: null, breakStatus };
}
