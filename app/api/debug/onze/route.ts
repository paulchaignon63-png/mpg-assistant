/** Diagnostic temporaire : calcul du 11 + saison. À SUPPRIMER. */
import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import {
  getRecommendedTeamWithSubstitutes,
  getSuggestedCaptain,
  type PoolPlayer,
} from "@/lib/recommendation";

const IDS = [
  "mpg_6865", "mpg_3805",
  "mpg_1980", "mpg_44", "mpg_14225", "mpg_552", "mpg_2710",
  "mpg_7263", "mpg_12844", "mpg_101", "mpg_398", "mpg_2286",
  "mpg_1557", "mpg_10491", "mpg_601", "mpg_1210", "mpg_7411",
  "mpg_6389", "mpg_6214", "mpg_5999", "mpg_2194",
];

export async function GET() {
  const { players, nextMatchDate, playedRounds } = await getChampionshipData("1");
  const selected = IDS.map((id) => players.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

  const pool: PoolPlayer[] = selected.map((p) => ({
    id: p.id, name: p.name, position: p.position, clubName: p.club,
    average: p.average, matchs: p.matchs, goals: p.goals,
    averageLast5: p.averageLast5, momentum: p.momentum,
    last5Notes: p.last5Notes, last5Minutes: p.last5Minutes, last5OpponentRounds: p.last5OpponentRounds,
    quotation: p.quotation,
    isInjured: p.status === "injured", isSuspended: p.status === "suspended", isDoubtful: p.status === "doubtful",
  }));
  const squad: Record<string, unknown> = {};
  for (const p of selected) squad[p.id] = { id: p.id };

  const { recommended, substitutes, lofteurs } = getRecommendedTeamWithSubstitutes(squad, 343, pool, {
    championshipDays: Math.max(1, playedRounds), totalTeams: 18, nextMatchDate,
  });
  const captain = getSuggestedCaptain(recommended);

  return NextResponse.json(
    {
      nextMatchDate: nextMatchDate?.toISOString() ?? null,
      playedRounds,
      onze: recommended.map((p) => ({ n: p.name, pos: p.position, s: p.recommendationScore })),
      capitaine: captain?.name,
      indispo: lofteurs.filter((p) => p.recommendationScore === 0).map((p) => `${p.name} (${p.scoreZeroReason})`),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
