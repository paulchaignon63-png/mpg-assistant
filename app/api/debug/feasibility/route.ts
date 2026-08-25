/** Diagnostic temporaire : Transfermarkt passes déc. exploitable ? À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function grab(label: string, url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    const text = await res.text();
    // Lignes de joueurs dans une table Transfermarkt
    const playerLinks = (text.match(/\/profil\/spieler\/\d+/g) ?? []).length;
    // Colonnes "Passes décisives" / "Assists"
    const assistHeader =
      text.includes("Passes décisives") || text.includes("Assists") || text.includes("Vorlagen");
    return {
      label,
      url,
      status: res.status,
      taille: text.length,
      liensJoueurs: playerLinks,
      colonnePassesDec: assistHeader,
      aTableItems: text.includes("items"),
    };
  } catch (e) {
    return { label, url, erreur: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    grab("tm-assists-2025", "https://www.transfermarkt.com/ligue-1/torvorlagen/wettbewerb/FR1/plus/1/saison_id/2025"),
    grab("tm-assists-alt", "https://www.transfermarkt.com/ligue-1/assistsammler/wettbewerb/FR1/saison_id/2025"),
    grab("tm-scorers", "https://www.transfermarkt.com/ligue-1/torschuetzenliste/wettbewerb/FR1/saison_id/2025"),
  ]);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
