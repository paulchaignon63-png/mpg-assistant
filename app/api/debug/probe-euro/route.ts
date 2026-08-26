import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET() {
  const out: Record<string, unknown> = {};

  // 1) MPGStats : quelles compétitions/saisons dans data.e ?
  try {
    const r = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    const j = await r.json();
    const events = j?.data?.e ?? [];
    const bySeason: Record<string, { n: number; sample: unknown[] }> = {};
    for (const e of events) {
      const k = String(e.s ?? "?");
      bySeason[k] ??= { n: 0, sample: [] };
      bySeason[k].n++;
      if (bySeason[k].sample.length < 2)
        bySeason[k].sample.push({ t1: e.t1, t2: e.t2, dB: e.dB, d: e.d });
    }
    out.mpgstats = {
      activeSeason: j?.data?.mL?.aS?.i,
      lastRound: j?.data?.mL?.aS?.cD?.lD,
      totalEvents: events.length,
      bySeason,
    };
  } catch (e) {
    out.mpgstats = { error: String(e).slice(0, 200) };
  }

  // 2) ESPN : forme d'un event UCL passé (confirme que la recette marchera)
  try {
    const r = await fetch(
      "https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/events/401862897?lang=fr",
      { headers: { "User-Agent": UA }, cache: "no-store" }
    );
    const j = await r.json();
    out.espnEventShape = {
      date: j?.date,
      name: j?.name,
      keys: Object.keys(j ?? {}).slice(0, 15),
      competitorRefs: (j?.competitions?.[0]?.competitors ?? []).map(
        (c: { id?: string; homeAway?: string; team?: { $ref?: string } }) => ({
          homeAway: c.homeAway,
          team: c.team?.$ref,
        })
      ),
    };
  } catch (e) {
    out.espnEventShape = { error: String(e).slice(0, 200) };
  }

  return NextResponse.json(out);
}
