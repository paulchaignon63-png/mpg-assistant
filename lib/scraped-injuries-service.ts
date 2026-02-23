/**
 * Service blessures enrichi - API-Football + données scrappées
 * Fusionne les blessures de plusieurs sources avec contextualisation (club)
 *
 * Fallback API-Football = Transfermarkt + Sofascore (voir lib/sources-fallback.ts)
 */

import { fetchInjuries } from "./injuries-service";
import { aggregateScrapedData } from "./scrapers";
import type { InjuriesResult, InjuryItemWithContext } from "./injuries-service";
import type { ScrapedInjury } from "@/types/scraped";
import { buildAbsenceExplainedPlayerNames } from "./absence-explained-service";

export interface EnrichedInjuriesResult extends InjuriesResult {
  scrapedInjured?: string[];
  scrapedDoubtful?: string[];
  /** Blessures avec contexte club pour matching contextualisé */
  injuredItems?: InjuryItemWithContext[];
  doubtfulItems?: InjuryItemWithContext[];
  /** Joueurs dont l'absence est expliquée (blessure, suspension, sélection, etc.) - pour mode star */
  absenceExplainedPlayerNames?: Set<string>;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeInjuryLists(
  api: string[],
  scraped: string[],
  normalize: (s: string) => string
): string[] {
  const seen = new Set(api.map(normalize));
  const merged = [...api];
  for (const name of scraped) {
    const n = normalize(name);
    if (!seen.has(n)) {
      seen.add(n);
      merged.push(name);
    }
  }
  return merged;
}

function toInjuryItem(i: ScrapedInjury | { playerName: string; status: string; clubName?: string }): InjuryItemWithContext {
  return { playerName: i.playerName, clubName: i.clubName };
}

/**
 * Récupère les blessures : API-Football (si activé) + scraping.
 * Fallback API-Football = Transfermarkt + Sofascore uniquement.
 */
export async function fetchEnrichedInjuries(
  championshipId: number | string,
  apiKey: string | undefined,
  options?: { enableScraping?: boolean }
): Promise<EnrichedInjuriesResult> {
  const { enableScraping = true } = options ?? {};

  const useApiFootball = process.env.ENABLE_API_FOOTBALL === "1" && apiKey?.trim();
  let apiResult: { injured: string[]; doubtful: string[] };
  let apiFailed = false;
  try {
    apiResult = useApiFootball
      ? await fetchInjuries(championshipId, apiKey)
      : { injured: [] as string[], doubtful: [] as string[] };
  } catch {
    apiResult = { injured: [], doubtful: [] };
    apiFailed = true;
  }

  const useFallbackSourcesOnly = !useApiFootball || apiFailed;

  if (!enableScraping) {
    return {
      ...apiResult,
      injuredItems: apiResult.injured.map((n) => ({ playerName: n, clubName: undefined })),
      doubtfulItems: apiResult.doubtful.map((n) => ({ playerName: n, clubName: undefined })),
      absenceExplainedPlayerNames: new Set<string>(),
    };
  }

  try {
    const scraped = await aggregateScrapedData({
      transfermarkt: true,
      fallbackSourcesOnly: useFallbackSourcesOnly,
      championshipId,
    });

    const structuredInjuries: ScrapedInjury[] = scraped.injuries;

    const newsInjuries = scraped.news
      .filter((n) => n.type === "injury" && n.playerNames && n.playerNames.length > 0)
      .flatMap((n) => {
        const title = (n.title + " " + (n.excerpt ?? "")).toLowerCase();
        const isDoubtful =
          title.includes("doute") ||
          title.includes("doubtful") ||
          title.includes("incertain") ||
          title.includes("?");
        const clubContext = n.clubNames && n.clubNames.length > 0 ? n.clubNames[0] : undefined;
        return (n.playerNames ?? []).map((playerName) => ({
          playerName,
          status: (isDoubtful ? "doubtful" : "out") as "out" | "doubtful",
          clubName: clubContext,
        }));
      });

    const allInjuries: Array<{ playerName: string; status: "out" | "doubtful"; clubName?: string }> = [
      ...structuredInjuries.map((i) => ({ playerName: i.playerName, status: i.status, clubName: i.clubName })),
      ...newsInjuries,
    ];

    const scrapedInjured = allInjuries.filter((i) => i.status === "out").map((i) => i.playerName);
    const scrapedDoubtful = allInjuries.filter((i) => i.status === "doubtful").map((i) => i.playerName);

    const injuredItems: InjuryItemWithContext[] = [
      ...apiResult.injured.map((name) => ({ playerName: name, clubName: undefined })),
      ...allInjuries.filter((i) => i.status === "out").map(toInjuryItem),
    ];
    const doubtfulItems: InjuryItemWithContext[] = [
      ...apiResult.doubtful.map((name) => ({ playerName: name, clubName: undefined })),
      ...allInjuries.filter((i) => i.status === "doubtful").map(toInjuryItem),
    ];

    const injured = mergeInjuryLists(apiResult.injured, scrapedInjured, normalizeName);
    const doubtful = mergeInjuryLists(apiResult.doubtful, scrapedDoubtful, normalizeName);

    const absenceExplained = buildAbsenceExplainedPlayerNames(scraped);
    for (const n of doubtful) {
      absenceExplained.add(normalizeName(n));
    }

    return {
      injured,
      doubtful,
      scrapedInjured: scrapedInjured.length > 0 ? scrapedInjured : undefined,
      scrapedDoubtful: scrapedDoubtful.length > 0 ? scrapedDoubtful : undefined,
      injuredItems: injuredItems.length > 0 ? injuredItems : undefined,
      doubtfulItems: doubtfulItems.length > 0 ? doubtfulItems : undefined,
      absenceExplainedPlayerNames: absenceExplained,
    };
  } catch (err) {
    console.warn("[scraped-injuries] Scraping failed, using API only:", err);
    const doubtfulSet = new Set<string>();
    for (const n of apiResult.doubtful) doubtfulSet.add(normalizeName(n));
    return {
      ...apiResult,
      injuredItems: apiResult.injured.map((n) => ({ playerName: n, clubName: undefined })),
      doubtfulItems: apiResult.doubtful.map((n) => ({ playerName: n, clubName: undefined })),
      absenceExplainedPlayerNames: doubtfulSet,
    };
  }
}
