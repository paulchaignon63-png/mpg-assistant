import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { teamId } = await params;
  if (!teamId) {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }

  try {
    const client = createMpgClient();
    client.setToken(auth, "");
    const team = await client.getTeam(teamId);
    return NextResponse.json(team);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
