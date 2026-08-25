/** Diagnostic temporaire : effet du contexte adversaire. À SUPPRIMER. */
import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import {
  getRecommendedTeamWithSubstitutes,
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
  const { players, playedRounds, totalTeams } = await getChampionshipData("1");
  const selected = IDS.map((id) => players.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

  const base = (p: (typeof selected)[number]): PoolPlayer => ({
    id: p.id, name: p.name, position: p.position, clubName: p.club,
    average: p.average, matchs: p.matchs, goals: p.goals,
    averageLast5: p.averageLast5, momentum: p.momentum,
    last5Notes: p.last5Notes, last5Minutes: p.last5Minutes,
    quotation: p.quotation,
    isInjured: p.status === "injured", isSuspended: p.status === "suspended", isDoubtful: p.status === "doubtful",
  });

  const withCtx: PoolPlayer[] = selected.map((p) => ({
    ...base(p),
    nextOpponentRank: p.nextOpponentRank, isHome: p.isHome,
    opponentGoalsFor: p.opponentGoalsFor, opponentGoalsAgainst: p.opponentGoalsAgainst,
    teamFormWinsLast5: p.teamFormWinsLast5,
  }));
  const withoutCtx: PoolPlayer[] = selected.map(base);

  const squad: Record<string, unknown> = {};
  for (const p of selected) squad[p.id] = { id: p.id };
  const opts = { championshipDays: Math.max(1, playedRounds), totalTeams };

  const a = getRecommendedTeamWithSubstitutes(squad, 343, withoutCtx, opts).recommended;
  const b = getRecommendedTeamWithSubstitutes(squad, 343, withCtx, opts).recommended;

  return NextResponse.json(
    {
      totalTeams,
      adversaires: selected.slice(0, 6).map((p) => ({
        j: p.name, club: p.club, adv: p.nextOpponentName,
        dom: p.isHome, rangAdv: p.nextOpponentRank,
      })),
      sans_contexte: a.map((p) => ({ n: p.name, s: p.recommendationScore })),
      avec_contexte: b.map((p) => ({ n: p.name, s: p.recommendationScore })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
