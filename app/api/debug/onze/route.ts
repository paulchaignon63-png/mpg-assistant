/** Diagnostic temporaire : détection saison/journées. À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const res = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
  });
  const data = (await res.json()) as {
    e?: Array<{ i?: number; dB?: number; d?: number; s?: number }>;
    mL?: { aS?: { i?: number; n?: string } };
  };
  const now = Math.floor(Date.now() / 1000);
  const events = data.e ?? [];

  const future = events.filter((e) => e.dB != null && e.dB > now).sort((a, b) => (a.dB ?? 0) - (b.dB ?? 0));
  const past = events.filter((e) => e.dB != null && e.dB <= now);

  // Répartition par saison sur les événements passés récents (90 derniers jours)
  const recentCut = now - 90 * 24 * 60 * 60;
  const recentPast = past.filter((e) => (e.dB ?? 0) >= recentCut);
  const bySeasonRecent: Record<string, { count: number; maxRound: number; rounds: number[] }> = {};
  for (const e of recentPast) {
    const k = String(e.s);
    if (!bySeasonRecent[k]) bySeasonRecent[k] = { count: 0, maxRound: 0, rounds: [] };
    bySeasonRecent[k].count++;
    if (e.d != null) {
      bySeasonRecent[k].maxRound = Math.max(bySeasonRecent[k].maxRound, e.d);
      if (!bySeasonRecent[k].rounds.includes(e.d)) bySeasonRecent[k].rounds.push(e.d);
    }
  }

  return NextResponse.json(
    {
      now_iso: new Date(now * 1000).toISOString(),
      activeSeason_mL: data.mL?.aS,
      nextEvent: future[0] ? { dB: new Date((future[0].dB ?? 0) * 1000).toISOString(), d: future[0].d, s: future[0].s } : null,
      next5: future.slice(0, 5).map((e) => ({ dB: new Date((e.dB ?? 0) * 1000).toISOString(), d: e.d, s: e.s })),
      recentPast5: recentPast.slice(-8).map((e) => ({ dB: new Date((e.dB ?? 0) * 1000).toISOString(), d: e.d, s: e.s })),
      bySeasonRecent,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
