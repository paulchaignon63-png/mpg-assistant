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
    const userIdVariants = userId
      ? [userId, `mpg_user_${userId.replace(/^mpg_user_/i, "")}`, userId.replace(/^mpg_user_/i, "")]
      : [];

    // #region agent log
    const sample = leagues.slice(0, 5).map((league: unknown) => {
      const l = league as Record<string, unknown>;
      return { name: l.name, status: l.status, mode: l.mode, finishedState: l.finishedState, keys: Object.keys(l), divisionId: l.divisionId };
    });
    fetch('http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard/route.ts',message:'API raw leagues sample',data:{sample,count:leagues.length},timestamp:Date.now(),hypothesisId:'H4-H5'})}).catch(()=>{});
    // #endregion

    const enriched = await Promise.all(
      leagues.map(async (league: unknown) => {
        const l = league as { divisionId?: string; leagueId?: string; name?: string; championshipId?: string; teamId?: string; [k: string]: unknown };
        const divId = l.divisionId ?? l.leagueId;
        let teamId: string | undefined = l.teamId;
        if (!teamId && divId) {
          try {
            const div = await client.getDivision(divId);
            const teams = (div.usersTeams ?? {}) as Record<string, string>;
            const teamIds = Object.values(teams);
            for (const uid of userIdVariants) {
              if (teams[uid]) {
                teamId = teams[uid];
                break;
              }
            }
            if (!teamId && teamIds.length > 0) teamId = teamIds[0];
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
