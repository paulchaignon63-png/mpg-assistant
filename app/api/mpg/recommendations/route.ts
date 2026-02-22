import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";
import { getMpgStatsPlayers } from "@/lib/mpgstats-client";
import { getRecommendedTeam, type PoolPlayer } from "@/lib/recommendation";

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
  statsMap: Map<string, { average: number; matchs: number; goals: number }>
): PoolPlayer[] {
  return poolPlayers.map((p) => {
    const name = p.name ?? [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
    if (!name) return p;
    const key = normalizeName(name);
    const stats = statsMap.get(key);
    if (!stats) return p;
    return {
      ...p,
      average: stats.average,
      matchs: stats.matchs,
      goals: stats.goals,
    };
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

    const [team, pool, coach, statsMap] = await Promise.all([
      client.getTeam(teamId),
      championshipId ? client.getPoolPlayers(championshipId).catch(() => null) : null,
      divisionId ? client.getCoach(divisionId).catch(() => null) : null,
      championshipId ? getMpgStatsPlayers(championshipId).catch(() => new Map()) : new Map(),
    ]);

    const coachFormation = coach as { matchTeamFormation?: { composition?: number } } | null;
    const form = coachFormation?.matchTeamFormation?.composition ?? formation;

    const squad = team.squad as Record<string, unknown> | undefined;
    let poolPlayers: PoolPlayer[] = pool?.poolPlayers ?? (pool as { players?: PoolPlayer[] })?.players ?? [];
    poolPlayers = enrichPoolWithStats(poolPlayers, statsMap);
    const recommended = getRecommendedTeam(squad, form, [], poolPlayers);

    return NextResponse.json({
      team: team.name,
      formation: form,
      recommended,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
