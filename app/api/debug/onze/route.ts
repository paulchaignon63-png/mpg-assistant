/** Diagnostic temporaire : force d'équipe sur les gardiens. À SUPPRIMER. */
import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import { computePlayerScore, type PoolPlayer } from "@/lib/recommendation";

// Gardiens : Risser (Lens), Lopes (Angers), + quelques autres.
const GK_IDS = ["mpg_11697", "mpg_1524", "mpg_6865", "mpg_3805", "mpg_12818"];

export async function GET() {
  const { players, playedRounds, totalTeams } = await getChampionshipData("1");
  const opts = { championshipDays: Math.max(1, playedRounds), totalTeams };

  const rows = GK_IDS.map((id) => {
    const p = players.get(id);
    if (!p) return { id, found: false };
    const pool: PoolPlayer = {
      id: p.id, name: p.name, position: p.position, clubName: p.club,
      average: p.average, matchs: p.matchs, goals: p.goals,
      averageLast5: p.averageLast5, momentum: p.momentum,
      last5Notes: p.last5Notes, last5Minutes: p.last5Minutes, quotation: p.quotation,
      nextOpponentRank: p.nextOpponentRank, isHome: p.isHome, teamFormWinsLast5: p.teamFormWinsLast5,
    };
    const sansEquipe = computePlayerScore({ ...pool, position: p.position, recommendationScore: 0 }, opts);
    const avecEquipe = computePlayerScore({ ...pool, teamRank: p.teamRank, position: p.position, recommendationScore: 0 }, opts);
    return {
      nom: p.name, club: p.club, rangEquipe: p.teamRank, adv: p.nextOpponentName, dom: p.isHome,
      note_passee: p.averageLast5 ?? p.average,
      score_sans_force_equipe: sansEquipe,
      score_avec_force_equipe: avecEquipe,
    };
  });

  return NextResponse.json({ totalTeams, playedRounds, gardiens: rows }, { headers: { "Cache-Control": "no-store" } });
}
