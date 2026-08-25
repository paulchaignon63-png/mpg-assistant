/** Diagnostic temporaire : autres sources de passes décisives. À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function probe(label: string, url: string, look: string[]) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
    });
    const text = await res.text();
    const found: Record<string, boolean> = {};
    for (const n of look) found[n] = text.toLowerCase().includes(n.toLowerCase());
    return {
      label,
      status: res.status,
      server: res.headers.get("server"),
      taille: text.length,
      liensJoueurs: (text.match(/spieler|player|joueur|athlete/gi) ?? []).length,
      contient: found,
      debut: text.slice(0, 120).replace(/\s+/g, " "),
    };
  } catch (e) {
    return { label, url, erreur: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    // worldfootball.net : tableau "passes décisives" tout fait (une page, tous les joueurs)
    probe("worldfootball-assists", "https://www.worldfootball.net/assists/fra-ligue-1-2025-2026/", ["assist", "Passes", "spieler"]),
    // ESPN API JSON : leaders de la saison (dont assists)
    probe("espn-leaders", "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fra.1/seasons/2025/types/1/leaders?lang=fr", ["assist", "totalAssists", "leaders"]),
    // ESPN site API : simple reachability
    probe("espn-scoreboard", "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard", ["events", "competitions"]),
    // L'Équipe : page stats joueurs
    probe("lequipe", "https://www.lequipe.fr/Football/ligue-1/page-statistiques/passes-decisives", ["passes", "décisive", "assist"]),
    // Ligue1 officiel
    probe("ligue1", "https://www.ligue1.fr/", ["ligue1", "stats", "player"]),
  ]);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
