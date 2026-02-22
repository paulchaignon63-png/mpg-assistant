import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const client = createMpgClient();
    client.setToken(auth, "");
    const dashboard = await client.getDashboard();
    const items = dashboard.leaguesDivisionsItems ?? (dashboard as { leagues?: unknown[] }).leagues ?? [];
    const leagues = Array.isArray(items) ? items : [];

    // Enrichir avec teamId pour chaque division
    const userId = request.headers.get("x-mpg-user-id");
    const enriched = await Promise.all(
      leagues.map(async (league: unknown) => {
        const l = league as { divisionId?: string; leagueId?: string; name?: string; championshipId?: string; [k: string]: unknown };
        const divId = l.divisionId ?? l.leagueId;
        let teamId: string | undefined;
        if (divId) {
          try {
            const div = await client.getDivision(divId);
            const teams = div.usersTeams ?? {};
            teamId = (userId && teams[userId]) ?? Object.values(teams)[0] as string | undefined;
          } catch {
            // ignore
          }
        }
        return { ...l, teamId };
      })
    );

    return NextResponse.json({ leaguesDivisionsItems: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
