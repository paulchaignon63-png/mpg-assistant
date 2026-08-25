/** Diagnostic temporaire : clés des matchs MPGStats (passes déc / cartons par match ?). À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const res = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
  });
  const data = (await res.json()) as { p?: Array<Record<string, unknown>> };
  const players = data.p ?? [];

  // Union de TOUTES les clés rencontrées dans les objets-match, sur tout le championnat.
  const matchKeyUnion = new Set<string>();
  const examplesByKey: Record<string, unknown> = {};
  for (const p of players) {
    for (const m of (p.p as Array<Record<string, unknown>>) ?? []) {
      for (const k of Object.keys(m)) {
        matchKeyUnion.add(k);
        if (!(k in examplesByKey)) examplesByKey[k] = m[k];
      }
    }
  }

  // Quelques matchs "riches" (avec le plus de clés) pour comprendre la structure.
  const richMatches: Array<Record<string, unknown>> = [];
  for (const p of players) {
    for (const m of (p.p as Array<Record<string, unknown>>) ?? []) {
      if (Object.keys(m).length >= 6) {
        richMatches.push({ joueur: p.n, ...m });
        if (richMatches.length >= 12) break;
      }
    }
    if (richMatches.length >= 12) break;
  }

  return NextResponse.json(
    { matchKeys: [...matchKeyUnion], examplesByKey, richMatches },
    { headers: { "Cache-Control": "no-store" } }
  );
}
