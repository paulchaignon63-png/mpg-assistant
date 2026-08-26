import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET() {
  const r = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  const j = await r.json();

  const clubs: Record<number, string> = {};
  for (const c of j?.c ?? []) if (c?.i != null) clubs[c.i] = c.n ?? c.rn ?? `#${c.i}`;

  const bySeason: Record<string, unknown> = {};
  for (const e of j?.e ?? []) {
    if (e?.dB == null) continue;
    const k = String(e.s ?? "?");
    const cur = (bySeason[k] ??= {
      n: 0,
      min: e.dB,
      max: e.dB,
      clubIds: new Set<number>(),
      sample: [] as string[],
    }) as {
      n: number;
      min: number;
      max: number;
      clubIds: Set<number>;
      sample: string[];
    };
    cur.n++;
    cur.min = Math.min(cur.min, e.dB);
    cur.max = Math.max(cur.max, e.dB);
    if (e.t1 != null) cur.clubIds.add(e.t1);
    if (e.t2 != null) cur.clubIds.add(e.t2);
    if (cur.sample.length < 4) {
      const d = new Date(e.dB * 1000).toISOString().slice(0, 16);
      cur.sample.push(`${d} J${e.d} ${clubs[e.t1] ?? e.t1} - ${clubs[e.t2] ?? e.t2}`);
    }
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bySeason)) {
    const s = v as { n: number; min: number; max: number; clubIds: Set<number>; sample: string[] };
    out[k] = {
      matchs: s.n,
      clubs: s.clubIds.size,
      du: new Date(s.min * 1000).toISOString().slice(0, 10),
      au: new Date(s.max * 1000).toISOString().slice(0, 10),
      exemples: s.sample,
    };
  }

  return NextResponse.json({
    saisonActive: j?.mL?.aS?.i,
    totalClubsFichier: Object.keys(clubs).length,
    parSaison: out,
  });
}
