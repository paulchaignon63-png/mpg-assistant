/** Diagnostic temporaire : matchs bruts d'un passeur. À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const res = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
  });
  const data = (await res.json()) as { p?: Array<Record<string, unknown>> };
  const players = data.p ?? [];

  // Vitinha (7263), Doué (11691), Barcola (10491) — passeurs.
  const wanted = new Set([7263, 11691, 10491]);
  const out = players
    .filter((p) => wanted.has(p.i as number))
    .map((p) => {
      const matches = (p.p as Array<Record<string, number>>) ?? [];
      const withA = matches.filter((m) => (m.a ?? 0) > 0);
      const withG = matches.filter((m) => (m.g ?? 0) > 0);
      return {
        nom: p.n,
        nbMatchs: matches.length,
        D_min: Math.min(...matches.map((m) => m.D ?? 0)),
        D_max: Math.max(...matches.map((m) => m.D ?? 0)),
        matchs_avec_passe_dec: withA.length,
        exemples_passe_dec: withA.slice(0, 4),
        matchs_avec_but: withG.length,
        exemples_but: withG.slice(0, 2),
        toutes_cles_a: matches.some((m) => "a" in m),
      };
    });

  return NextResponse.json({ out }, { headers: { "Cache-Control": "no-store" } });
}
