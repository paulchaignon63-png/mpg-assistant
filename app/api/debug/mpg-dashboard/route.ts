/**
 * GET /api/debug/mpg-dashboard
 *
 * Route de debug pour vérifier le format des données MPG, notamment nextRealGameWeekDate.
 * Nécessite l'auth (Authorization: Bearer <token>).
 *
 * Utilisation :
 * 1. Connecte-toi à l'app (ta page de login)
 * 2. Ouvre les DevTools (F12) > Console
 * 3. Colle et exécute :
 *    fetch('/api/debug/mpg-dashboard', { headers: { Authorization: localStorage.getItem('mpg_token') } }).then(r=>r.json()).then(console.log)
 * 4. Vérifie dans la réponse : chaque league a-t-elle nextRealGameWeekDate ? Quel format ?
 */
import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json(
      {
        error: "Non authentifié",
        hint: "Envoie le header Authorization avec ton token MPG (localStorage.getItem('mpg_token'))",
        example:
          "fetch('/api/debug/mpg-dashboard', { headers: { Authorization: localStorage.getItem('mpg_token') } }).then(r=>r.json()).then(console.log)",
      },
      { status: 401 }
    );
  }

  try {
    const client = createMpgClient();
    client.setToken(auth, request.headers.get("x-mpg-user-id") ?? "");
    const dashboard = await client.getDashboard();
    const items =
      dashboard.leaguesDivisionsItems ??
      (dashboard as { leagues?: unknown[] }).leagues ??
      [];
    const leagues = Array.isArray(items) ? items : [];

    const sample = leagues.slice(0, 10).map((l: unknown) => {
      const league = l as Record<string, unknown>;
      return {
        name: league.name,
        championshipId: league.championshipId,
        divisionId: league.divisionId,
        nextRealGameWeekDate: league.nextRealGameWeekDate,
        nextRealGameWeekDateType: typeof league.nextRealGameWeekDate,
        nextRealGameWeekDateRaw:
          league.nextRealGameWeekDate != null
            ? JSON.stringify(league.nextRealGameWeekDate)
            : null,
      };
    });

    return NextResponse.json({
      count: leagues.length,
      sample,
      rawFirstLeague: leagues[0] ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
