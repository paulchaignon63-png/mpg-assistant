/** Diagnostic temporaire du vivier. À SUPPRIMER après usage. */
import { NextResponse } from "next/server";

const BASE = "https://api.sofascore.com/api/v1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function j(url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

export async function GET() {
  const tid = 34; // Ligue 1
  const out: Record<string, unknown> = {};

  const seasons = await j(`${BASE}/unique-tournament/${tid}/seasons`);
  out.seasons_status = seasons.status;
  let seasonId: number | undefined;
  try {
    const s = JSON.parse(seasons.body) as { seasons?: Array<{ id: number; year: string }> };
    out.seasons_top = (s.seasons ?? []).slice(0, 3);
    seasonId = s.seasons?.[0]?.id;
  } catch {
    out.seasons_body = seasons.body.slice(0, 200);
  }

  if (seasonId) {
    const st = await j(`${BASE}/unique-tournament/${tid}/season/${seasonId}/standings/total`);
    out.standings_status = st.status;
    try {
      const parsed = JSON.parse(st.body) as { standings?: Array<{ rows?: Array<{ team?: { id?: number; name?: string } }> }> };
      const rows = parsed.standings?.[0]?.rows ?? [];
      out.standings_rows = rows.length;
      out.first_team = rows[0]?.team;
      const teamId = rows[0]?.team?.id;
      if (teamId) {
        const pl = await j(`${BASE}/team/${teamId}/players`);
        out.players_status = pl.status;
        try {
          const pj = JSON.parse(pl.body) as { players?: unknown[] };
          out.players_count = pj.players?.length;
          out.player_sample = pj.players?.[0];
        } catch {
          out.players_body = pl.body.slice(0, 200);
        }
      }
    } catch {
      out.standings_body = st.body.slice(0, 200);
    }
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
