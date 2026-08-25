/** Diagnostic temporaire : objet joueur brut MPGStats (quelles stats fines ?). À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const res = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
  });
  const data = (await res.json()) as { p?: Array<Record<string, unknown>> };
  const players = data.p ?? [];

  // Barcola (attaquant), Gradit (défenseur), Vitinha (milieu) — profils variés.
  const wanted = new Set([10491, 2710, 7263]);
  const found = players.filter((p) => wanted.has(p.i as number));

  // Pour chacun : toutes les clés + contenu des objets d'agrégat + 1 match détaillé.
  const dump = found.map((p) => {
    const out: Record<string, unknown> = { i: p.i, n: p.n, fp: p.fp };
    out.topKeys = Object.keys(p);
    for (const k of ["s", "a", "sa", "la", "es", "esp"] as const) {
      const v = p[k];
      if (v && typeof v === "object") out[`${k}_keys`] = Object.keys(v as Record<string, unknown>);
      out[`${k}`] = v;
    }
    const matches = (p.p as unknown[]) ?? [];
    out.matchCount = matches.length;
    out.matchSample = matches.slice(0, 2);
    if (matches.length > 0) out.matchKeys = Object.keys(matches[0] as Record<string, unknown>);
    return out;
  });

  return NextResponse.json({ dump }, { headers: { "Cache-Control": "no-store" } });
}
