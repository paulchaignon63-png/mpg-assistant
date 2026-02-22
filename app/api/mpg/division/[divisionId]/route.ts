import { NextRequest, NextResponse } from "next/server";
import { createMpgClient } from "@/lib/mpg-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ divisionId: string }> }
) {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { divisionId } = await params;
  if (!divisionId) {
    return NextResponse.json({ error: "divisionId requis" }, { status: 400 });
  }

  try {
    const client = createMpgClient();
    client.setToken(auth, "");
    const division = await client.getDivision(divisionId);
    return NextResponse.json(division);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
