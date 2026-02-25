import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";
import { getMpgStatsPlayersWithFallback, type MpgStatsEnrichment } from "@/lib/mpgstats-client";
import { getSofascorePlayerDetailedStats } from "@/lib/sofascore-client";
import { scrapeTransfermarktSuspensions } from "@/lib/scrapers/sources/transfermarkt";
import { fetchEnrichedInjuries } from "@/lib/scraped-injuries-service";
import {
  fetchOpponentRanksByClub,
  getOpponentRankForClub,
  type OpponentRankData,
} from "@/lib/opponent-rank-service";
import { isPlayerInInjuryList, isPlayerInjuryMatchWithContext } from "@/lib/injuries-service";
import { fetchSofascoreStandingsAndFixtures, getNextMatchdayFirstMatch } from "@/lib/sofascore-client";
import { getRecommendedTeamWithSubstitutes, type PoolPlayer } from "@/lib/recommendation";
import { getTeamFormForClubs } from "@/lib/team-form-service";
import { getRoundToOpponentRankMap } from "@/lib/match-opponent-rank-service";
import { getTransferredRecentlyPlayerNames } from "@/lib/transfer-recency-service";
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
  suspendedNames?: Set<string>;
  opponentRankMap?: Map<string, number>;
  isHomeByClub?: Map<string, boolean>;
  teamStatsByClub?: Map<string, { goalsFor: number; goalsAgainst: number }>;
  clubByRank?: Map<number, string>;
  teamFormMap?: Map<string, { winsLast5: number; drawsLast5?: number; lossesLast5?: number }>;
  transferredRecentlySet?: Set<string>;
  injuryReturnByPlayer?: Map<string, string>;
  suspensionReturnByPlayer?: Map<string, string>;
  marketValueByPlayer?: Map<string, string>;
}

function enrichPoolWithStats(
  poolPlayers: PoolPlayer[],
  options: EnrichPoolOptions
): PoolPlayer[] {
  const {
    statsMap,
    sofascoreMap,
    suspendedNames,
    opponentRankMap,
    isHomeByClub,
    teamStatsByClub,
    clubByRank,
    teamFormMap,
    transferredRecentlySet,
    injuryReturnByPlayer,
    suspensionReturnByPlayer,
    marketValueByPlayer,
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
          ...(stats.last5Minutes != null && {
            matchsLast15Days: stats.last5Minutes.filter((m) => (m ?? 0) > 0).length,
          }),
          assists: stats.assists ?? sofascore?.assists ?? p.assists,
          pctTitularisations: stats.pctTitularisations ?? sofascore?.pctTitularisations ?? p.pctTitularisations,
          yellowCards: stats.yellowCards ?? sofascore?.yellowCards ?? p.yellowCards,
          redCards: stats.redCards ?? sofascore?.redCards ?? p.redCards,
          isSuspended: stats.isSuspended ?? (suspendedNames?.has(key) ? true : undefined) ?? p.isSuspended,
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
          ...(suspendedNames?.has(key) && { isSuspended: true }),
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
    if (injuryReturnByPlayer?.has(key)) (updated as { injuryReturnDate?: string }).injuryReturnDate = injuryReturnByPlayer.get(key);
    if (suspensionReturnByPlayer?.has(key)) (updated as { suspensionReturnDate?: string }).suspensionReturnDate = suspensionReturnByPlayer.get(key);
    if (marketValueByPlayer?.has(key)) (updated as { marketValue?: string }).marketValue = marketValueByPlayer.get(key);

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
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "recommendations/route.ts:POST",
        message: "recommendations called",
        data: { championshipId, effectiveChampId, hasApiKey: !!apiKey?.trim(), willCallApiFootball },
        timestamp: Date.now(),
        hypothesisId: "A,B,C,E",
      }),
    }).catch(() => {});
    // #endregion

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
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
      injuries,
      opponentData,
      roundOpponentRankMap,
      scrapedData,
      nextMatchDate,
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
        ? fetchEnrichedInjuries(effectiveChampId, apiKey, {
            enableScraping: process.env.ENABLE_SCRAPED_INJURIES !== "0",
          })
        : { injured: [], doubtful: [], injuredItems: [], doubtfulItems: [], absenceExplainedPlayerNames: new Set<string>() },
      effectiveChampId
        ? fetchOpponentData(effectiveChampId, apiKey, willCallApiFootball)
        : { rankByClub: new Map(), totalTeams: 18 },
      effectiveChampId
        ? getRoundToOpponentRankMap(effectiveChampId).catch(() => new Map())
        : Promise.resolve(new Map()),
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
    ]);

    const coachFormation = coach as { matchTeamFormation?: { composition?: number } } | null;
    // Utiliser la formation demandée par l'utilisateur (dropdown), pas celle du coach MPG.
    // Le coach MPG sert uniquement de fallback si formation non fournie (chargement initial).
    const form = formation;

    // #region agent log
    const formationLog = {
      location: "recommendations/route.ts:formation",
      message: "formation used (post-fix: always request)",
      data: {
        formationRequested: formation,
        coachComposition: coachFormation?.matchTeamFormation?.composition,
        formUsed: form,
        runId: "post-fix",
      },
      timestamp: Date.now(),
      hypothesisId: "H1",
    };
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formationLog),
    }).catch(() => {});
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[DEBUG formation]", JSON.stringify(formationLog.data));
    }
    // #endregion

    const normForMatch = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    const suspendedNames = new Set<string>();
    const suspensionReturnByPlayer = new Map<string, string>();
    for (const s of suspensionsFull) {
      const k = normForMatch(s.playerName);
      suspendedNames.add(k);
      if (s.returnDate) suspensionReturnByPlayer.set(k, s.returnDate);
    }

    const injuryReturnByPlayer = new Map<string, string>();
    for (const it of injuries.injuredItems ?? []) {
      if (it.returnDate) injuryReturnByPlayer.set(normForMatch(it.playerName), it.returnDate);
    }
    for (const it of injuries.doubtfulItems ?? []) {
      if (it.returnDate && !injuryReturnByPlayer.has(normForMatch(it.playerName))) {
        injuryReturnByPlayer.set(normForMatch(it.playerName), it.returnDate);
      }
    }

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
      suspendedNames,
      opponentRankMap: opponentData.rankByClub,
      isHomeByClub: (opponentData as OpponentRankData).isHomeByClub,
      teamStatsByClub: (opponentData as OpponentRankData).teamStatsByClub,
      clubByRank: (opponentData as OpponentRankData).clubByRank,
      teamFormMap,
      transferredRecentlySet,
      injuryReturnByPlayer,
      suspensionReturnByPlayer,
      marketValueByPlayer,
    });

    const playersWithAdvRank = poolPlayers.filter((p) => p.nextOpponentRank != null).length;
    // #region agent log
    const injuredFull = injuries.injured ?? [];
    const injuredItems = injuries.injuredItems ?? [];
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
    const targetNames = ["Dembélé Ousmane", "Clauss Jonathan", "Wahi Elye", "Sangaré Mamadou", "Kaba Mohamed", "Akliouche Maghnes"];
    const scoreZeroReasons: Record<string, "injured" | "suspended" | "unknown"> = {};
    const isInSuspendedSet = (n: string) => {
      const nNorm = norm(n);
      return suspendedNames.has(nNorm) || Array.from(suspendedNames).some((s) => s.includes(nNorm) || nNorm.includes(s));
    };
    for (const name of targetNames) {
      const poolPlayer = poolPlayers.find((p) => {
        const pName = p.name ?? [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
        return norm(pName || "").includes(norm(name)) || norm(name).includes(norm(pName || ""));
      });
      const club = (poolPlayer as { clubName?: string })?.clubName;
      const inInjured = isPlayerInInjuryList(name, injuredFull) || (injuredItems.length > 0 && isPlayerInjuryMatchWithContext(name, club, injuredItems));
      const inSuspended = isInSuspendedSet(name) || (poolPlayer && (poolPlayer as { isSuspended?: boolean }).isSuspended === true);
      if (inInjured) scoreZeroReasons[name] = "injured";
      else if (inSuspended) scoreZeroReasons[name] = "suspended";
      else scoreZeroReasons[name] = "unknown";
    }
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "recommendations/route.ts:dataReceived",
        message: "Injuries and suspensions for score-0 lofteurs",
        data: {
          injuredCount: injuredFull.length,
          injuredFull,
          injuredItemsNames: injuredItems.map((i) => i.playerName),
          suspendedList: Array.from(suspendedNames),
          scoreZeroReasons,
        },
        timestamp: Date.now(),
        hypothesisId: "A,B",
      }),
    }).catch(() => {});
    // #endregion

    const championshipDays =
      (division as { liveState?: { currentGameWeek?: number } } | null)?.liveState?.currentGameWeek ?? 15;

    const { recommended, substitutes, lofteurs } = getRecommendedTeamWithSubstitutes(
      squad,
      form,
      injuries.injured,
      poolPlayers,
      {
        championshipDays,
        injuredDoubtful: injuries.doubtful,
        injuredItems: injuries.injuredItems,
        injuredDoubtfulItems: injuries.doubtfulItems,
        totalTeams: opponentData.totalTeams,
        absenceExplainedPlayerNames: injuries.absenceExplainedPlayerNames,
        nextMatchDate: nextMatchDate?.firstMatchTimestamp
          ? new Date(nextMatchDate.firstMatchTimestamp * 1000)
          : undefined,
        roundOpponentRankMap: roundOpponentRankMap.size > 0 ? roundOpponentRankMap : undefined,
      }
    );

    // #region agent log
    const byPosCount = { G: 0, D: 0, M: 0, A: 0 };
    for (const p of recommended) {
      if (p.position && p.position in byPosCount) byPosCount[p.position as keyof typeof byPosCount]++;
    }
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "recommendations/route.ts:response",
        message: "recommended lineup counts",
        data: { formUsed: form, byPosCount, recommendedCount: recommended.length },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
    // #endregion

    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({location:"recommendations/route.ts:response",message:"lofteurs before send",data:{lofteursLength:lofteurs.length,lofteursSample:lofteurs.slice(0,3),recommendedCount:recommended.length},timestamp:Date.now(),hypothesisId:"H2,H3,H4"})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      team: team.name,
      formation: form,
      recommended,
      substitutes,
      lofteurs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
