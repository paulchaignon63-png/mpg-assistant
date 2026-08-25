/** Diagnostic temporaire : structure Understat (passes déc / xA par joueur). À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function grab(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    const text = await res.text();
    // Noms des variables JSON.parse('...') embarquées
    const vars = Array.from(text.matchAll(/var\s+(\w+)\s*=\s*JSON\.parse/g)).map((m) => m[1]);
    // Un échantillon du bloc playersData s'il existe
    const idx = text.indexOf("playersData");
    const sample = idx >= 0 ? text.slice(idx, idx + 400) : null;
    return {
      url,
      status: res.status,
      taille: text.length,
      varsJson: vars,
      aPlayersData: idx >= 0,
      echantillonPlayers: sample,
      clésUtiles: {
        assists: text.includes('"assists"'),
        xA: text.includes('"xA"'),
        key_id: text.includes('"player_name"') || text.includes('"id"'),
        team: text.includes('"team_title"'),
      },
    };
  } catch (e) {
    return { url, erreur: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    grab("https://understat.com/league/Ligue_1"), // saison en cours
    grab("https://understat.com/league/Ligue_1/2025"), // saison passée (référence)
  ]);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
