/** GET /api/mpg/leagues — ligues du compte MPG connecté. */
import { NextResponse } from "next/server";
import { listMpgLeagues, MpgAuthError, readMpgSession } from "@/lib/mpg-link";

export async function GET() {
  const session = await readMpgSession();
  if (!session) return NextResponse.json({ error: "Non connecté à MPG" }, { status: 401 });
  try {
    return NextResponse.json({ leagues: await listMpgLeagues(session.token, session.userId) });
  } catch (e) {
    const status = e instanceof MpgAuthError ? 401 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "MPG indisponible" }, { status });
  }
}
