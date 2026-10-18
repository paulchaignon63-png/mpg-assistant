/**
 * POST /api/review — résultats réels d'une journée pour une compo donnée.
 * Sert au bilan d'après-journée et au suivi en direct.
 *
 * Corps : { championshipId, round, starters: string[], bench: string[] }
 * Renvoie, par joueur : note réelle (ou null si pas encore jouée), buts,
 * titulaire ; le total réel avec les remplacements MPG ; et le meilleur 11
 * possible a posteriori (même effectif), pour séparer malchance et choix.
 */
import { NextResponse } from "next/server";
import { loadChampionship } from "@/lib/data/mpgstats";
import { roundContext } from "@/lib/engine/project";
import { scoreActual, type Projection } from "@/lib/engine/simulate";
import { AVAILABLE_FORMATIONS, FORMATIONS, GOAL_VALUE, ROTALDO_NOTE, type Pos } from "@/lib/engine/mpg-rules";

function stub(id: string, position: Pos): Projection {
  return { id, name: id, club: "", position, pStart: 1, pPlay: 1, noteMean: 5, noteSd: 1, goalRate: 0 };
}

export async function POST(request: Request) {
  let body: { championshipId?: string; round?: number; starters?: string[]; bench?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { championshipId, round } = body;
  if (!championshipId || typeof round !== "number") {
    return NextResponse.json({ error: "championshipId et round requis" }, { status: 400 });
  }
  const snap = await loadChampionship(championshipId);
  if (!snap) return NextResponse.json({ error: "Données indisponibles" }, { status: 502 });

  const seasonId = snap.currentSeasonId;
  const ctx = roundContext(snap, seasonId, round);
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  const now = Date.now() / 1000;
  const ids = [...new Set([...(body.starters ?? []), ...(body.bench ?? [])])].slice(0, 40);

  const players = ids.map((id) => {
    const p = byId.get(id);
    const fixture = p?.clubId != null ? ctx.fixtureByClub.get(p.clubId) : undefined;
    const m = p?.matches.find((x) => x.seasonId === seasonId && x.round === round);
    const rated = fixture ? snap.ratedEventIds.has(fixture.id) : false;
    const state = !fixture ? "none" : rated ? "done" : fixture.kickoff <= now ? "live" : "upcoming";
    return {
      id,
      name: p?.name ?? id,
      club: p?.club ?? "",
      position: (p?.position ?? "M") as Pos,
      state,
      kickoff: fixture?.kickoff ?? null,
      score: fixture && fixture.homeScore != null ? `${fixture.homeScore}-${fixture.awayScore}` : null,
      opponent: fixture ? snap.clubs.get(fixture.homeId === p?.clubId ? fixture.awayId : fixture.homeId)?.name : undefined,
      note: state === "done" ? m?.note ?? 0 : null,
      goals: m?.goals ?? 0,
      started: m?.started ?? false,
    };
  });

  const info = new Map(players.map((p) => [p.id, p]));
  const actual = new Map(players.map((p) => [p.id, { note: p.note ?? 0, goals: p.goals }]));
  const starters = (body.starters ?? []).filter((id) => info.has(id)).map((id) => stub(id, info.get(id)!.position));
  const bench = (body.bench ?? []).filter((id) => info.has(id)).map((id) => stub(id, info.get(id)!.position));
  const real = scoreActual(starters, bench, actual);

  // Meilleur 11 a posteriori : pour chaque formation, les meilleurs réels par ligne.
  const value = (id: string) => (info.get(id)!.note ?? 0) + GOAL_VALUE * info.get(id)!.goals;
  let best = { total: -1, formation: 343, ids: [] as string[] };
  for (const formation of AVAILABLE_FORMATIONS) {
    const f = FORMATIONS[formation];
    const chosen: string[] = [];
    let total = 0;
    for (const pos of ["G", "D", "M", "A"] as const) {
      const line = ids
        .filter((id) => info.get(id)!.position === pos)
        .sort((a, b) => value(b) - value(a))
        .slice(0, f[pos]);
      for (const id of line) {
        chosen.push(id);
        total += info.get(id)!.note ? value(id) : ROTALDO_NOTE;
      }
      total += Math.max(0, f[pos] - line.length) * ROTALDO_NOTE;
    }
    if (total > best.total) best = { total, formation, ids: chosen };
  }

  const done = players.filter((p) => p.state === "done").length;
  return NextResponse.json({
    round,
    complete: players.length > 0 && players.every((p) => p.state === "done" || p.state === "none"),
    progress: players.length ? done / players.length : 0,
    total: real.total,
    rotaldo: real.rotaldo,
    best,
    players,
  });
}
