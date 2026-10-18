/** GET /api/mpg/import?teamId=…&championshipId=… — effectif et bonus d'une équipe MPG. */
import { NextResponse } from "next/server";
import { importMpgTeam, MpgAuthError, readMpgSession } from "@/lib/mpg-link";

export async function GET(request: Request) {
  const session = await readMpgSession();
  if (!session) return NextResponse.json({ error: "Non connecté à MPG" }, { status: 401 });
  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId");
  const championshipId = url.searchParams.get("championshipId") ?? "1";
  if (!teamId) return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  try {
    return NextResponse.json(await importMpgTeam(session.token, teamId, championshipId));
  } catch (e) {
    const status = e instanceof MpgAuthError ? 401 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import impossible" }, { status });
  }
}
