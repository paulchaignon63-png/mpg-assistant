/** Diagnostic temporaire : stats fines rebranchées. À SUPPRIMER. */
import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";

// Barcola, Vitinha, Gradit, Dembélé, Doué, un défenseur, un gardien.
const IDS = ["mpg_10491", "mpg_7263", "mpg_2710", "mpg_1557", "mpg_11691", "mpg_1980", "mpg_6865"];

export async function GET() {
  const { players, playedRounds } = await getChampionshipData("1");
  const rows = IDS.map((id) => {
    const p = players.get(id);
    if (!p) return { id, found: false };
    return {
      nom: p.name,
      poste: p.position,
      club: p.club,
      passes_dec: p.assists,
      titularisation: p.pctTitularisations,
      precision_passes: p.accuratePassPct,
      buts: p.goals,
      note_moy: p.average,
    };
  });
  return NextResponse.json({ playedRounds, joueurs: rows }, { headers: { "Cache-Control": "no-store" } });
}
