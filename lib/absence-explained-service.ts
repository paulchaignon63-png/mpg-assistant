/**
 * Service "absence expliquée" - vérification que l'inactivité d'un joueur
 * était due à blessure, suspension, sélection nationale ou problèmes extra-sportifs.
 * Utilisé pour le mode "star de retour" dans computePlayerScore.
 */

import type { ScrapedDataAggregate } from "@/types/scraped";

const NEWS_WINDOW_DAYS = 45;

const ABSENCE_EXPLAINED_KEYWORDS = [
  "sélection",
  "selection",
  "convoqué",
  "convocation",
  "international",
  "équipe de france",
  "equipe de france",
  "national team",
  "personnel",
  "familial",
  "deuil",
];

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePublishedAt(publishedAt?: string): number | null {
  if (!publishedAt) return null;
  const parsed = Date.parse(publishedAt);
  return Number.isNaN(parsed) ? null : parsed;
}

function isWithinWindow(publishedAt?: string): boolean {
  const ts = parsePublishedAt(publishedAt);
  if (ts == null) return true;
  const cutoff = Date.now() - NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

function matchesAbsenceKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return ABSENCE_EXPLAINED_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Construit le Set des noms de joueurs dont l'absence est expliquée
 * (blessure, suspension, sélection nationale, problèmes extra-sportifs)
 * via les news scrappées (fenêtre 45 jours).
 */
export function buildAbsenceExplainedPlayerNames(
  scraped: ScrapedDataAggregate
): Set<string> {
  const result = new Set<string>();

  for (const news of scraped.news ?? []) {
    if (!news.playerNames?.length) continue;
    if (!isWithinWindow(news.publishedAt)) continue;

    if (news.type === "injury" || news.type === "suspension") {
      for (const name of news.playerNames) {
        result.add(normalizeName(name));
      }
      continue;
    }

    if (news.type === "other" || news.type === "form") {
      const text = (news.title + " " + (news.excerpt ?? "")).toLowerCase();
      if (matchesAbsenceKeywords(text)) {
        for (const name of news.playerNames) {
          result.add(normalizeName(name));
        }
      }
    }
  }

  return result;
}
