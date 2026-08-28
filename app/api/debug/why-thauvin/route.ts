import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const r = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  const j = await r.json();
  const rows = (j?.p ?? []).filter((p: { n?: string }) =>
    ["Thauvin", "Vitinha", "Lees-Melou"].some((n) => (p.n ?? "").includes(n))
  );
  return NextResponse.json({
    trouves: rows.length,
    brut: rows.slice(0, 3).map((p: Record<string, unknown>) => ({
      nom: `${p.f ?? ""} ${p.n ?? ""}`.trim(),
      i: p.i, k: p.k, r: p.r, rh: p.rh, a: p.a, sa: p.sa, la: p.la, fp: p.fp,
      es: p.es, esp: p.esp,
    })),
  });
}
