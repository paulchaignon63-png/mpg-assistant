/** Diagnostic temporaire : rapprochement passes déc. ESPN ↔ effectif. À SUPPRIMER. */
import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import { getSeasonAssists, normalizeAssistKey } from "@/lib/espn-stats";

const IDS = [
  "mpg_10491", "mpg_1557", "mpg_11691", "mpg_7263", "mpg_1980",
  "mpg_44", "mpg_601", "mpg_398", "mpg_2286", "mpg_357",
];

export async function GET() {
  const [{ players }, assists] = await Promise.all([
    getChampionshipData("1"),
    getSeasonAssists("1", new Date().getUTCFullYear()),
  ]);

  const rows = IDS.map((id) => {
    const p = players.get(id);
    if (!p) return { id, found: false };
    return {
      nom: p.name,
      club: p.club,
      poste: p.position,
      passes_dec: assists.get(normalizeAssistKey(p.name)) ?? 0,
    };
  });

  return NextResponse.json(
    { nbPasseursEspn: assists.size, top: [...assists.entries()].slice(0, 8), effectif: rows },
    { headers: { "Cache-Control": "no-store" } }
  );
}
