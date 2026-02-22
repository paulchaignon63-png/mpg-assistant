import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";
import { getRecommendedTeam } from "@/lib/recommendation";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { teamId, divisionId, formation = 343 } = await request.json();
    if (!teamId) {
      return NextResponse.json({ error: "teamId requis" }, { status: 400 });
    }

    const client = createMpgClient();
    client.setToken(auth, "");

    const team = await client.getTeam(teamId);
    const coach = divisionId ? await client.getCoach(divisionId).catch(() => null) : null;
    const coachFormation = coach as { matchTeamFormation?: { composition?: number } } | null;
    const form = coachFormation?.matchTeamFormation?.composition ?? formation;

    const squad = team.squad as Record<string, unknown> | undefined;
    const recommended = getRecommendedTeam(squad, form, []);

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
