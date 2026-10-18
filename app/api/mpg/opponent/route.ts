/** GET /api/mpg/opponent?divisionId=…&teamId=…&championshipId=… — adversaire de la journée. */
import { NextResponse } from "next/server";
import { MpgAuthError, mpgOpponent, readMpgSession } from "@/lib/mpg-link";

export async function GET(request: Request) {
  const session = await readMpgSession();
  if (!session) return NextResponse.json({ error: "Non connecté à MPG" }, { status: 401 });
  const url = new URL(request.url);
  const divisionId = url.searchParams.get("divisionId");
  const teamId = url.searchParams.get("teamId");
  const championshipId = url.searchParams.get("championshipId") ?? "1";
  if (!divisionId || !teamId) return NextResponse.json({ error: "divisionId et teamId requis" }, { status: 400 });
  try {
    const opp = await mpgOpponent(session.token, divisionId, teamId, championshipId);
    if (!opp) return NextResponse.json({ error: "Pas d'adversaire trouvé pour la prochaine journée." }, { status: 404 });
    return NextResponse.json(opp);
  } catch (e) {
    const status = e instanceof MpgAuthError ? 401 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "MPG indisponible" }, { status });
  }
}
