import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";
import { getMpgStatsPlayersWithFallback, type MpgStatsEnrichment } from "@/lib/mpgstats-client";
import { getSofascorePlayerDetailedStats, getSofascoreSuspendedFromLastRound } from "@/lib/sofascore-client";
import { scrapeTransfermarktSuspensions } from "@/lib/scrapers/sources/transfermarkt";
import { fetchEnrichedInjuries } from "@/lib/scraped-injuries-service";
import {
  fetchOpponentRanksByClub,
  getOpponentRankForClub,
  type OpponentRankData,
} from "@/lib/opponent-rank-service";
import { type InjuryItemWithContext } from "@/lib/injuries-service";
import { fetchSofascoreStandingsAndFixtures, getNextMatchdayFirstMatch, getMatchCountLast7DaysOtherCompetitions } from "@/lib/sofascore-client";
import { getRecommendedTeamWithSubstitutes, getSuggestedCaptain, type PoolPlayer } from "@/lib/recommendation";
import { getTeamFormForClubs } from "@/lib/team-form-service";
import { getRoundToOpponentRankMap, countMatchesInWindow } from "@/lib/match-opponent-rank-service";
import { getTransferredRecentlyPlayerNames } from "@/lib/transfer-recency-service";
import { getCoTitularisationLowPairs } from "@/lib/rotation-service";
import { resolvePlayerStatuses, type StatusEntryWithReturn } from "@/lib/status-aggregation";
import { getStatusSourcesConfig } from "@/lib/status-sources-config";
import { aggregateScrapedData } from "@/lib/scrapers";

/** Fallback API-Football = Sofascore (voir lib/sources-fallback.ts) */
async function fetchOpponentData(
  championshipId: string,
  apiKey: string | undefined,
  useApiFootball: boolean
): Promise<OpponentRankData> {
  if (useApiFootball && apiKey?.trim()) {
    try {
      const api = await fetchOpponentRanksByClub(championshipId, apiKey);
      if (api.rankByClub.size > 0) return api;
    } catch {
      /* fallback Transfermarkt+Sofascore → Sofascore (classement + matchs) */
    }
  }
  try {
    const data = await fetchSofascoreStandingsAndFixtures(championshipId);
    if (data && data.rankByClub.size > 0)
      return {
        rankByClub: data.rankByClub,
        totalTeams: data.totalTeams,
        isHomeByClub: data.isHomeByClub,
        teamStatsByClub: data.teamStatsByClub,
        clubByRank: data.clubByRank,
      };
  } catch (err) {
    if (process.env.NODE_ENV === "development")
      console.warn("[Sofascore] fetchOpponentData failed:", err);
  }
  return { rankByClub: new Map(), totalTeams: 18 } as OpponentRankData;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface EnrichPoolOptions {
  statsMap: Map<string, MpgStatsEnrichment>;
  sofascoreMap?: Map<string, { pctTitularisations?: number; yellowCards?: number; redCards?: number; assists?: number; xG?: number; tackles?: number; interceptions?: number; cleanSheets?: number }>;
  opponentRankMap?: Map<string, number>;
  isHomeByClub?: Map<string, boolean>;
  teamStatsByClub?: Map<string, { goalsFor: number; goalsAgainst: number }>;
  clubByRank?: Map<number, string>;
  teamFormMap?: Map<string, { winsLast5: number; drawsLast5?: number; lossesLast5?: number }>;
  transferredRecentlySet?: Set<string>;
  marketValueByPlayer?: Map<string, string>;
  /** Dates des matchs de championnat, pour la fenêtre de fatigue réelle. */
  matchDateByClub?: Map<string, Map<number, number>>;
  /** Bug 2.1 : matchs en 7j hors championnat (LDC, Coupe) par clé joueur normalisée */
  matchsLast7DaysOtherCompsMap?: Map<string, number>;
}

function enrichPoolWithStats(
  poolPlayers: PoolPlayer[],
  options: EnrichPoolOptions
): PoolPlayer[] {
  const {
    statsMap,
    sofascoreMap,
    opponentRankMap,
    isHomeByClub,
    teamStatsByClub,
    clubByRank,
    teamFormMap,
    transferredRecentlySet,
    marketValueByPlayer,
    matchsLast7DaysOtherCompsMap,
    matchDateByClub,
  } = options;

  const normClub = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

  return poolPlayers.map((p) => {
    const name = p.name ?? [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
    if (!name) return p;
    const key = normalizeName(name);
    const stats = statsMap.get(key);
    const sofascore = sofascoreMap?.get(key);

    const updated: PoolPlayer = stats
      ? {
          ...p,
          average: stats.average,
          matchs: stats.matchs,
          goals: stats.goals,
          ...(stats.position && { position: stats.position }),
          ...(stats.averageLast5 != null && { averageLast5: stats.averageLast5 }),
          ...(stats.momentum != null && { momentum: stats.momentum }),
          ...(stats.last5Notes != null && { last5Notes: stats.last5Notes }),
          ...(stats.last5Minutes != null && { last5Minutes: stats.last5Minutes }),
          ...(stats.last5OpponentRounds != null && { last5OpponentRounds: stats.last5OpponentRounds }),
          assists: stats.assists ?? sofascore?.assists ?? p.assists,
          pctTitularisations: stats.pctTitularisations ?? sofascore?.pctTitularisations ?? p.pctTitularisations,
          yellowCards: stats.yellowCards ?? sofascore?.yellowCards ?? p.yellowCards,
          redCards: stats.redCards ?? sofascore?.redCards ?? p.redCards,
          isSuspended: stats.isSuspended ?? p.isSuspended,
          xG: sofascore?.xG ?? (p as { xG?: number }).xG,
          tackles: sofascore?.tackles ?? (p as { tackles?: number }).tackles,
          interceptions: sofascore?.interceptions ?? (p as { interceptions?: number }).interceptions,
          cleanSheets: sofascore?.cleanSheets ?? (p as { cleanSheets?: number }).cleanSheets,
        }
      : {
          ...p,
          ...(sofascore?.assists != null && { assists: sofascore.assists }),
          ...(sofascore?.pctTitularisations != null && { pctTitularisations: sofascore.pctTitularisations }),
          ...(sofascore?.yellowCards != null && { yellowCards: sofascore.yellowCards }),
          ...(sofascore?.redCards != null && { redCards: sofascore.redCards }),
          ...(sofascore?.xG != null && { xG: sofascore.xG }),
          ...(sofascore?.tackles != null && { tackles: sofascore.tackles }),
          ...(sofascore?.interceptions != null && { interceptions: sofascore.interceptions }),
          ...(sofascore?.cleanSheets != null && { cleanSheets: sofascore.cleanSheets }),
        };

    if (opponentRankMap?.size && p.clubName) {
      const rank = getOpponentRankForClub(p.clubName, opponentRankMap);
      if (rank != null) updated.nextOpponentRank = rank;
    }
    if (isHomeByClub?.size && p.clubName) {
      const clubNorm = normClub(p.clubName);
      const isHome = isHomeByClub.get(clubNorm);
      if (isHome !== undefined) (updated as { isHome?: boolean }).isHome = isHome;
      for (const [k, v] of isHomeByClub) {
        if (k.includes(clubNorm) || clubNorm.includes(k)) {
          (updated as { isHome?: boolean }).isHome = v;
          break;
        }
      }
    }
    if (teamFormMap?.size && p.clubName) {
      for (const [club, form] of teamFormMap) {
        if (namesMatchClub(p.clubName, club)) {
          (updated as { teamFormWinsLast5?: number }).teamFormWinsLast5 = form.winsLast5;
          break;
        }
      }
    }
    if (opponentRankMap && teamStatsByClub?.size && clubByRank?.size && p.clubName) {
      const oppRank = getOpponentRankForClub(p.clubName, opponentRankMap);
      if (oppRank != null) {
        const nextOppNorm = clubByRank.get(oppRank);
        if (nextOppNorm && teamStatsByClub.has(nextOppNorm)) {
          const oppStats = teamStatsByClub.get(nextOppNorm)!;
          (updated as { opponentGoalsFor?: number }).opponentGoalsFor = oppStats.goalsFor;
          (updated as { opponentGoalsAgainst?: number }).opponentGoalsAgainst = oppStats.goalsAgainst;
        }
      }
    }
    if (transferredRecentlySet?.has(key)) (updated as { transferredRecently?: boolean }).transferredRecently = true;
    if (marketValueByPlayer?.has(key)) (updated as { marketValue?: string }).marketValue = marketValueByPlayer.get(key);

    if (matchsLast7DaysOtherCompsMap?.has(key)) (updated as { matchsLast7DaysOtherComps?: number }).matchsLast7DaysOtherComps = matchsLast7DaysOtherCompsMap.get(key);

    // Fatigue : matchs de championnat réellement joués sur les 15 derniers jours.
    if (matchDateByClub?.size) {
      const played = countMatchesInWindow(
        matchDateByClub,
        p.clubName,
        (updated as { last5OpponentRounds?: number[] }).last5OpponentRounds,
        15
      );
      if (played != null) (updated as { matchsLast15Days?: number }).matchsLast15Days = played;
    }

    return updated;
  });
}

function namesMatchClub(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const na = a.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").replace(/[^a-z0-9\s]/g, "").trim();
  const nb = b.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").replace(/[^a-z0-9\s]/g, "").trim();
  return na === nb || na.includes(nb) || nb.includes(na);
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { teamId, divisionId, championshipId, formation = 343 } = await request.json();
    if (!teamId) {
      return NextResponse.json({ error: "teamId requis" }, { status: 400 });
    }

    const client = createMpgClient();
    client.setToken(auth, "");

    const apiKey = process.env.API_FOOTBALL_KEY;
    const enableApiFootball = process.env.ENABLE_API_FOOTBALL === "1";
    let effectiveChampId =
      championshipId &&
      championshipId !== "undefined" &&
      championshipId !== "null" &&
      String(championshipId).trim()
        ? championshipId
        : undefined;

    // Fallback: récupérer le championnat depuis la division si manquant (ligues terminées, etc.)
    if (!effectiveChampId && divisionId) {
      try {
        const div = await client.getDivision(divisionId);
        const divChamp = (div as { championshipId?: string | number })?.championshipId;
        if (divChamp != null && String(divChamp).trim()) {
          effectiveChampId = String(divChamp).trim();
        }
      } catch {
        /* ignore */
      }
    }

    // Pour le pool: utiliser effectiveChampId ou championshipId
    const poolChampId = effectiveChampId ?? (championshipId && String(championshipId).trim() ? championshipId : undefined);
    const willCallApiFootball = !!(effectiveChampId && apiKey?.trim() && enableApiFootball);

    if (process.env.NODE_ENV === "development") {
      console.log("[Le 11 parfait] championshipId:", championshipId, "→ effectiveChampId:", effectiveChampId, "| apiKey:", apiKey ? "OK" : "MANQUANTE");
    }

    const [
      team,
      pool,
      coach,
      division,
      statsMap,
      sofascoreMap,
      suspensionsFull,
      sofascoreSuspendedFromLastRound,
      injuries,
      opponentData,
      roundContext,
      scrapedData,
      nextMatchDate,
      matchsLast7DaysOtherCompsMap,
    ] = await Promise.all([
      client.getTeam(teamId),
      poolChampId ? client.getPoolPlayers(poolChampId).catch(() => null) : null,
      divisionId ? client.getCoach(divisionId).catch(() => null) : null,
      divisionId ? client.getDivision(divisionId).catch(() => null) : null,
      effectiveChampId ? getMpgStatsPlayersWithFallback(effectiveChampId) : Promise.resolve(new Map()),
      effectiveChampId
        ? getSofascorePlayerDetailedStats(effectiveChampId).catch(() => new Map())
        : Promise.resolve(new Map()),
      effectiveChampId
        ? scrapeTransfermarktSuspensions({ championshipId: effectiveChampId }).catch(() => [])
        : Promise.resolve([]),
      effectiveChampId
        ? getSofascoreSuspendedFromLastRound(effectiveChampId).catch(() => new Set<string>())
        : Promise.resolve(new Set<string>()),
      effectiveChampId
        ? fetchEnrichedInjuries(effectiveChampId, apiKey, {
            enableScraping: process.env.ENABLE_SCRAPED_INJURIES !== "0",
          })
        : { injured: [], doubtful: [], injuredItems: [], doubtfulItems: [], absenceExplainedPlayerNames: new Set<string>() },
      effectiveChampId
        ? fetchOpponentData(effectiveChampId, apiKey, willCallApiFootball)
        : { rankByClub: new Map(), totalTeams: 18 },
      effectiveChampId
        ? getRoundToOpponentRankMap(effectiveChampId).catch(() => ({
            rankByRound: new Map<number, Map<string, number>>(),
            matchDateByClub: new Map<string, Map<number, number>>(),
          }))
        : Promise.resolve({
            rankByRound: new Map<number, Map<string, number>>(),
            matchDateByClub: new Map<string, Map<number, number>>(),
          }),
      effectiveChampId
        ? aggregateScrapedData({ championshipId: effectiveChampId, transfermarkt: true }).catch(() => ({
            injuries: [],
            transfers: [],
            news: [],
            scrapedAt: "",
            sourcesOk: [],
            sourcesFailed: [],
          }))
        : Promise.resolve({ injuries: [], transfers: [], news: [], scrapedAt: "", sourcesOk: [], sourcesFailed: [] }),
      effectiveChampId
        ? getNextMatchdayFirstMatch(effectiveChampId).catch(() => null)
        : Promise.resolve(null),
      effectiveChampId
        ? getMatchCountLast7DaysOtherCompetitions(effectiveChampId).catch(() => new Map())
        : Promise.resolve(new Map<string, number>()),
    ]);

    // Formation demandée par l'utilisateur (dropdown), pas celle du coach MPG.
    const form = formation;


    const normForMatch = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    // Entrées de suspension : on conserve le club quand la source le donne,
    // il sert à départager les homonymes lors du rapprochement.
    const suspendedEntries: StatusEntryWithReturn[] = [];
    for (const s of suspensionsFull) {
      suspendedEntries.push({
        playerName: s.playerName,
        clubName: s.clubName,
        returnDate: s.returnDate,
      });
    }
    // Filet de sécurité : suspendus depuis les news (RSS, L'Equipe, etc.)
    for (const n of scrapedData.news ?? []) {
      if (n.type === "suspension" && n.playerNames?.length) {
        const clubContext = n.clubNames?.length ? n.clubNames[0] : undefined;
        for (const name of n.playerNames) {
          suspendedEntries.push({ playerName: name, clubName: clubContext });
        }
      }
    }
    // Filet de sécurité : cartons rouges dernière journée (SofaScore)
    for (const name of sofascoreSuspendedFromLastRound) {
      suspendedEntries.push({ playerName: name });
    }

    // Statuts blessés/douteux : utilisation directe des sources (SofaScore, MPG, RSS) via fetchEnrichedInjuries.
    // Plus de réconciliation sur "a joué les 2 dernières journées" (critère supprimé).
    // Agrégation avec hiérarchie configurable (STATUS_SOURCE_PRIORITY, TRUST_MPG_APTE_WHEN_CONFLICT).
    const statusConfig = getStatusSourcesConfig();

    // Annonces "dans le groupe" / "de retour" : lèvent l'absence.
    const apteEntries: StatusEntryWithReturn[] = [];
    for (const n of scrapedData.news ?? []) {
      if ((n.type === "in_squad" || n.type === "return") && n.playerNames?.length) {
        const clubContext = n.clubNames?.length ? n.clubNames[0] : undefined;
        for (const name of n.playerNames) {
          apteEntries.push({ playerName: name, clubName: clubContext });
        }
      }
    }
    // Dispo sur MPG (pastille verte)
    const mpgAvailableEntries: StatusEntryWithReturn[] = [];
    for (const p of pool?.poolPlayers ?? (pool as { players?: PoolPlayer[] })?.players ?? []) {
      if ((p as { available?: boolean }).available !== true) continue;
      const name = p.name ?? [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
      if (name) mpgAvailableEntries.push({ playerName: name, clubName: p.clubName });
    }

    const toEntries = (
      items: InjuryItemWithContext[] | undefined,
      names: string[] | undefined
    ): StatusEntryWithReturn[] =>
      items?.length
        ? items.map((it) => ({
            playerName: it.playerName,
            clubName: it.clubName,
            returnDate: it.returnDate,
          }))
        : (names ?? []).map((playerName) => ({ playerName }));

    const injuredEntries = toEntries(injuries.injuredItems, injuries.injured);
    const doubtfulEntries = toEntries(injuries.doubtfulItems, injuries.doubtful);

    const marketValueByPlayer = new Map<string, string>();
    for (const it of scrapedData.injuries ?? []) {
      if (it.marketValue) marketValueByPlayer.set(normForMatch(it.playerName), it.marketValue);
    }
    for (const it of scrapedData.transfers ?? []) {
      if (it.marketValue && !marketValueByPlayer.has(normForMatch(it.playerName))) {
        marketValueByPlayer.set(normForMatch(it.playerName), it.marketValue);
      }
    }

    const transferredRecentlySet = getTransferredRecentlyPlayerNames(scrapedData.transfers ?? []);

    const clubNamesFromPool = [
      ...new Set(
        (pool?.poolPlayers ?? (pool as { players?: PoolPlayer[] })?.players ?? [])
          .map((p) => p.clubName)
          .filter((c): c is string => !!c)
      ),
    ];
    const teamFormMap =
      effectiveChampId && clubNamesFromPool.length > 0
        ? await getTeamFormForClubs(effectiveChampId, clubNamesFromPool).catch(() => new Map())
        : new Map();

    const squad = team.squad as Record<string, unknown> | undefined;
    let poolPlayers: PoolPlayer[] = pool?.poolPlayers ?? (pool as { players?: PoolPlayer[] })?.players ?? [];
    poolPlayers = enrichPoolWithStats(poolPlayers, {
      statsMap,
      sofascoreMap,
      opponentRankMap: opponentData.rankByClub,
      isHomeByClub: (opponentData as OpponentRankData).isHomeByClub,
      teamStatsByClub: (opponentData as OpponentRankData).teamStatsByClub,
      clubByRank: (opponentData as OpponentRankData).clubByRank,
      teamFormMap,
      transferredRecentlySet,
      marketValueByPlayer,
      matchsLast7DaysOtherCompsMap,
      matchDateByClub: roundContext.matchDateByClub,
    });

    // Statuts : rapprochés une seule fois contre l'effectif enrichi, puis posés
    // en drapeaux sur les joueurs. Plus aucun rapprochement de noms en aval.
    const statuses = resolvePlayerStatuses(
      poolPlayers,
      {
        injured: injuredEntries,
        doubtful: doubtfulEntries,
        suspended: suspendedEntries,
        apte: apteEntries,
        mpgAvailable: mpgAvailableEntries,
      },
      statusConfig
    );
    const absenceExplainedSet = injuries.absenceExplainedPlayerNames ?? new Set<string>();
    poolPlayers = poolPlayers.map((p, index) => {
      const injured = statuses.injuredByIndex.get(index);
      const doubtful = statuses.doubtfulByIndex.get(index);
      const suspended = statuses.suspendedByIndex.get(index);
      const name = p.name ?? [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
      return {
        ...p,
        isInjured: injured != null ? true : undefined,
        isDoubtful: doubtful != null ? true : undefined,
        isSuspended: suspended != null ? true : p.isSuspended,
        isAbsenceExplained: name && absenceExplainedSet.has(normForMatch(name)) ? true : undefined,
        injuryReturnDate: injured?.returnDate ?? doubtful?.returnDate ?? p.injuryReturnDate,
        suspensionReturnDate: suspended?.returnDate ?? p.suspensionReturnDate,
      };
    });

    let rotationLowPairs = new Set<string>();
    if (effectiveChampId && poolPlayers.length > 0) {
      try {
        rotationLowPairs = await getCoTitularisationLowPairs(effectiveChampId, poolPlayers);
        if (process.env.NODE_ENV === "development" && rotationLowPairs.size > 0) {
          console.log("[Bug 2.2] Paires rotation (co-titul < 30%):", rotationLowPairs.size, Array.from(rotationLowPairs).slice(0, 5));
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.warn("[Bug 2.2] getCoTitularisationLowPairs failed:", e);
      }
    }

    if (process.env.NODE_ENV === "development") {
      const named = (m: Map<number, unknown>) =>
        Array.from(m.keys()).map((i) => poolPlayers[i]?.name ?? `#${i}`);
      console.log("[Statuts] Blessés:", named(statuses.injuredByIndex));
      console.log("[Statuts] Incertains:", named(statuses.doubtfulByIndex));
      console.log("[Statuts] Suspendus:", named(statuses.suspendedByIndex));
    }


    const championshipDays =
      (division as { liveState?: { currentGameWeek?: number } } | null)?.liveState?.currentGameWeek ?? 15;

    const { recommended, substitutes, lofteurs } = getRecommendedTeamWithSubstitutes(
      squad,
      form,
      poolPlayers,
      {
        championshipDays,
        totalTeams: opponentData.totalTeams,
        nextMatchDate: nextMatchDate?.firstMatchTimestamp
          ? new Date(nextMatchDate.firstMatchTimestamp * 1000)
          : undefined,
        roundOpponentRankMap:
          roundContext.rankByRound.size > 0 ? roundContext.rankByRound : undefined,
        rotationLowPairs,
      }
    );

    if (process.env.NODE_ENV === "development") {
      for (const p of [...recommended, ...(["G", "D", "M", "A"] as const).flatMap((pos) => substitutes[pos] ?? [])]) {
        const inj = (p as { isInjured?: boolean }).isInjured === true;
        const susp = (p as { isSuspended?: boolean }).isSuspended === true;
        if (p.recommendationScore > 0 && (inj || susp)) {
          console.error("[Bug 1.1/1.2] ERREUR: joueur recommandé avec score>0 mais indisponible:", p.name, { score: p.recommendationScore, isInjured: inj, isSuspended: susp });
        }
      }
    }




    const suggestedCaptain = getSuggestedCaptain(recommended);
    const suggestedCaptainId = suggestedCaptain?.id ?? suggestedCaptain?.name ?? null;

    return NextResponse.json({
      team: team.name,
      formation: form,
      recommended,
      substitutes,
      lofteurs,
      suggestedCaptainId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
