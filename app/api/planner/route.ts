/**
 * POST /api/planner — force attendue de ton équipe sur les prochaines
 * journées, pour choisir quand jouer tes bonus MPG.
 * Corps : { championshipId, playerIds, rounds?: number (5 par défaut) }
 */
import { NextResponse } from "next/server";
import { loadChampionship } from "@/lib/data/mpgstats";
import { nextRound, projectPlayers, roundContext } from "@/lib/engine/project";
import { expectedValue, optimizeLineup } from "@/lib/engine/optimize";

export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { championshipId?: string; playerIds?: string[]; rounds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!body.championshipId || !Array.isArray(body.playerIds) || body.playerIds.length === 0) {
    return NextResponse.json({ error: "Effectif requis" }, { status: 400 });
  }
  const snap = await loadChampionship(body.championshipId);
  if (!snap) return NextResponse.json({ error: "Données indisponibles" }, { status: 502 });
  const first = nextRound(snap);
  if (first == null) return NextResponse.json({ rounds: [], remainingRounds: 0 });

  const ids = new Set(body.playerIds);
  const squad = snap.players.filter((p) => ids.has(p.id));
  const horizon = Math.min(Math.max(1, body.rounds ?? 5), 8);
  const out = [];
  for (let r = first; r < first + horizon && r <= snap.roundsPerSeason; r++) {
    const ctx = roundContext(snap, snap.currentSeasonId, r);
    if (ctx.fixtureByClub.size === 0) continue;
    // Les statuts (blessures) ne valent que pour la prochaine journée.
    const proj = projectPlayers(snap, ctx, squad, {}, { useStatus: r === first });
    const plan = optimizeLineup(proj, { formation: "auto", mode: "balanced", sims: 400 });
    const projById = new Map(proj.map((p) => [p.id, p]));
    const best = [...plan.starters].sort((a, b) => expectedValue(b) - expectedValue(a))[0];
    const easy = plan.starters.filter((p) => {
      const rank = projById.get(p.id)?.opponentRank;
      return rank != null && rank > ctx.totalTeams * 0.66;
    }).length;
    out.push({
      round: r,
      kickoff: ctx.firstKickoff,
      mean: plan.stats.mean,
      p10: plan.stats.p10,
      p90: plan.stats.p90,
      formation: plan.formation,
      easyFixtures: easy,
      bestPlayer: best ? { id: best.id, name: best.name, value: expectedValue(best) } : null,
    });
  }
  return NextResponse.json({ rounds: out, remainingRounds: Math.max(0, snap.roundsPerSeason - first + 1) });
}
