import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";
import { getMpgStatsPlayersWithFallback, type MpgStatsEnrichment } from "@/lib/mpgstats-client";
import { getSofascorePlayerStats } from "@/lib/sofascore-client";
import { scrapeTransfermarktSuspensions } from "@/lib/scrapers/sources/transfermarkt";
import { fetchEnrichedInjuries } from "@/lib/scraped-injuries-service";
import {
  fetchOpponentRanksByClub,
  getOpponentRankForClub,
  type OpponentRankData,
} from "@/lib/opponent-rank-service";
import { isPlayerInInjuryList, isPlayerInjuryMatchWithContext } from "@/lib/injuries-service";
import { fetchSofascoreStandingsAndFixtures } from "@/lib/sofascore-client";
import { getRecommendedTeamWithSubstitutes, type PoolPlayer } from "@/lib/recommendation";

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
      };
  } catch (err) {
    if (process.env.NODE_ENV === "development")
      console.warn("[Sofascore] fetchOpponentData failed:", err);
  }
  return { rankByClub: new Map(), totalTeams: 18 };
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function enrichPoolWithStats(
  poolPlayers: PoolPlayer[],
  statsMap: Map<string, MpgStatsEnrichment>,
  sofascoreMap?: Map<string, { pctTitularisations?: number; yellowCards?: number; redCards?: number; assists?: number }>,
  suspendedNames?: Set<string>,
  opponentRankMap?: Map<string, number>
): PoolPlayer[] {
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
          assists: stats.assists ?? sofascore?.assists ?? p.assists,
          pctTitularisations: stats.pctTitularisations ?? sofascore?.pctTitularisations ?? p.pctTitularisations,
          yellowCards: stats.yellowCards ?? sofascore?.yellowCards ?? p.yellowCards,
          redCards: stats.redCards ?? sofascore?.redCards ?? p.redCards,
          isSuspended: stats.isSuspended ?? (suspendedNames?.has(key) ? true : undefined) ?? p.isSuspended,
        }
      : {
          ...p,
          ...(sofascore?.assists != null && { assists: sofascore.assists }),
          ...(sofascore?.pctTitularisations != null && { pctTitularisations: sofascore.pctTitularisations }),
          ...(sofascore?.yellowCards != null && { yellowCards: sofascore.yellowCards }),
          ...(sofascore?.redCards != null && { redCards: sofascore.redCards }),
          ...(suspendedNames?.has(key) && { isSuspended: true }),
        };

    if (opponentRankMap?.size && p.clubName) {
      const rank = getOpponentRankForClub(p.clubName, opponentRankMap);
      if (rank != null) updated.nextOpponentRank = rank;
    }
    return updated;
  });
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

    const [team, pool, coach, division, statsMap, sofascoreMap, suspensions, injuries, opponentData] = await Promise.all([
      client.getTeam(teamId),
      poolChampId ? client.getPoolPlayers(poolChampId).catch(() => null) : null,
      divisionId ? client.getCoach(divisionId).catch(() => null) : null,
      divisionId ? client.getDivision(divisionId).catch(() => null) : null,
      effectiveChampId ? getMpgStatsPlayersWithFallback(effectiveChampId) : Promise.resolve(new Map()),
      effectiveChampId
        ? getSofascorePlayerStats(effectiveChampId).catch(() => new Map())
        : Promise.resolve(new Map()),
      effectiveChampId
        ? scrapeTransfermarktSuspensions({ championshipId: effectiveChampId }).then((s) => {
            const set = new Set<string>();
            const norm = (n: string) =>
              n
                .toLowerCase()
                .normalize("NFD")
                .replace(/\p{Diacritic}/gu, "")
                .replace(/\s+/g, " ")
                .trim();
            for (const x of s) set.add(norm(x.playerName));
            return set;
          })
        : Promise.resolve(new Set<string>()),
      effectiveChampId
        ? fetchEnrichedInjuries(effectiveChampId, apiKey, {
            enableScraping: process.env.ENABLE_SCRAPED_INJURIES !== "0",
          })
        : { injured: [], doubtful: [], injuredItems: [], doubtfulItems: [], absenceExplainedPlayerNames: new Set<string>() },
      effectiveChampId
        ? fetchOpponentData(effectiveChampId, apiKey, willCallApiFootball)
        : { rankByClub: new Map(), totalTeams: 18 },
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

    const squad = team.squad as Record<string, unknown> | undefined;
    let poolPlayers: PoolPlayer[] = pool?.poolPlayers ?? (pool as { players?: PoolPlayer[] })?.players ?? [];
    poolPlayers = enrichPoolWithStats(
      poolPlayers,
      statsMap,
      sofascoreMap,
      suspensions,
      opponentData.rankByClub
    );

    const playersWithAdvRank = poolPlayers.filter((p) => p.nextOpponentRank != null).length;
    // #region agent log
    const injuredFull = injuries.injured ?? [];
    const injuredItems = injuries.injuredItems ?? [];
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
    const targetNames = ["Dembélé Ousmane", "Clauss Jonathan", "Wahi Elye", "Sangaré Mamadou", "Kaba Mohamed", "Akliouche Maghnes"];
    const scoreZeroReasons: Record<string, "injured" | "suspended" | "unknown"> = {};
    const isInSuspendedSet = (n: string) => {
      const nNorm = norm(n);
      const last = nNorm.split(" ").pop() ?? "";
      return Array.from(suspensions ?? []).some((s) => s === nNorm || s.includes(last) || nNorm.includes(s));
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
          suspendedList: Array.from(suspensions ?? []),
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
