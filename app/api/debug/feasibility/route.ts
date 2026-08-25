/** Diagnostic temporaire : sources de passes décisives joignables depuis Vercel ? À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function probe(
  label: string,
  url: string,
  opts: { headers?: Record<string, string>; look?: string[] } = {}
) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8", ...opts.headers },
    });
    const text = await res.text();
    const found: Record<string, boolean> = {};
    for (const needle of opts.look ?? []) found[needle] = text.includes(needle);
    return {
      label,
      url,
      status: res.status,
      server: res.headers.get("server"),
      contentType: res.headers.get("content-type"),
      taille: text.length,
      contient: found,
      debut: text.slice(0, 140).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { label, url, erreur: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    // Understat : une page = tous les joueurs L1 avec buts, passes déc., xG, xA (JSON dans le HTML)
    probe("understat", "https://understat.com/league/Ligue_1", {
      look: ["playersData", "assists", "xA"],
    }),
    // FotMob : API JSON, classement des passeurs
    probe("fotmob-api", "https://www.fotmob.com/api/leagues?id=53", {
      look: ["assists", "topAssists", "stats"],
    }),
    // FBref : table "passing" (passes déc. = Ast) — souvent protégé Cloudflare
    probe("fbref", "https://fbref.com/en/comps/13/passing/Ligue-1-Stats", {
      look: ["Assists", "assisted"],
    }),
    // Transfermarkt : page "passes décisives" du championnat (déjà joignable pour les blessures)
    probe("transfermarkt", "https://www.transfermarkt.fr/ligue-1/torvorlagen/wettbewerb/FR1", {
      look: ["torvorlagen", "Passe", "spieler"],
    }),
  ]);

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
