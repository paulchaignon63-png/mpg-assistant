/** Diagnostic temporaire : quelles sources répondent depuis Vercel ? À SUPPRIMER après usage. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function head(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers });
    const body = await res.text();
    return { status: res.status, server: res.headers.get("server"), len: body.length, start: body.slice(0, 120).replace(/\s+/g, " ") };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

export async function GET() {
  const results: Record<string, unknown> = {};

  // MPGStats : liste complète des joueurs L1 (nom, poste, stats) en un appel
  results["mpgstats"] = await head(
    "https://backend.mpgstats.fr/leagues/Ligue-1_v2.json",
    { "User-Agent": UA }
  );

  // Sofascore : simple UA
  results["sofascore-ua"] = await head(
    "https://api.sofascore.com/api/v1/unique-tournament/34/seasons",
    { "User-Agent": UA }
  );

  // Sofascore : en-têtes plus complets (referer, accept)
  results["sofascore-full"] = await head(
    "https://api.sofascore.com/api/v1/unique-tournament/34/seasons",
    {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": "fr-FR,fr;q=0.9",
      Referer: "https://www.sofascore.com/",
      Origin: "https://www.sofascore.com",
    }
  );

  // Miroir Sofascore parfois plus permissif
  results["sofascore-app"] = await head(
    "https://api.sofascore.app/api/v1/unique-tournament/34/seasons",
    { "User-Agent": UA }
  );

  // API MPG publique (données de championnat éventuelles, sans auth)
  results["mpg-championship"] = await head(
    "https://api.mpg.football/championship-players-pool/1",
    { "User-Agent": UA }
  );

  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
