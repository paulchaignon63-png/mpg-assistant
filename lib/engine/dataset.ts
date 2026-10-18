/**
 * Échantillons « journée passée » : pour chaque joueur et chaque journée, la
 * projection calculée AVANT le match et ce qui s'est réellement passé. Sert à
 * entraîner le modèle, au banc d'essai et à la page de précision.
 */

import type { ChampionshipSnapshot, Player } from "../data/mpgstats";
import { projectPlayer, roundContext, type PlayerProjection } from "./project";
import type { ModelCoefficients } from "./model";

export interface Actual {
  rated: boolean;
  started: boolean;
  note: number;
  goals: number;
}

export interface Sample {
  seasonId: number;
  round: number;
  player: Player;
  clubId: number;
  projection: PlayerProjection;
  actual: Actual;
}

/** Club du joueur à une journée donnée (son club au match le plus proche). */
export function playerClubAt(p: Player, seasonId: number, round: number): number | undefined {
  const season = p.matches.filter((m) => m.seasonId === seasonId && m.clubId != null);
  if (season.length === 0) return undefined;
  const before = season.filter((m) => m.round < round).sort((a, b) => b.round - a.round)[0];
  if (before) return before.clubId;
  return season.sort((a, b) => a.round - b.round)[0].clubId;
}

/** Journées rejouables : saison précédente complète et saison en cours jusqu'à la dernière jouée. */
export function backtestRounds(snapshot: ChampionshipSnapshot, minRound = 3): Array<{ seasonId: number; round: number }> {
  const out: Array<{ seasonId: number; round: number }> = [];
  const seasons = [snapshot.previousSeasonId, snapshot.currentSeasonId].filter((s): s is number => s != null);
  for (const seasonId of seasons) {
    // Une journée n'est rejouable qu'une fois (presque) tous ses matchs joués.
    const byRound = new Map<number, { done: number; total: number }>();
    for (const f of snapshot.fixtures) {
      if (f.seasonId !== seasonId) continue;
      const r = byRound.get(f.round) ?? { done: 0, total: 0 };
      r.total++;
      if (f.homeScore != null && f.awayScore != null) r.done++;
      byRound.set(f.round, r);
    }
    for (const [r, c] of [...byRound].sort((a, b) => a[0] - b[0])) {
      if (r >= minRound && c.done >= c.total * 0.9) out.push({ seasonId, round: r });
    }
  }
  return out;
}

export function samplesForRound(
  snapshot: ChampionshipSnapshot,
  seasonId: number,
  round: number,
  opts: { coefficients?: ModelCoefficients } = {}
): Sample[] {
  const ctx = roundContext(snapshot, seasonId, round);
  const out: Sample[] = [];
  for (const player of snapshot.players) {
    const clubId = playerClubAt(player, seasonId, round);
    if (clubId == null || !ctx.fixtureByClub.has(clubId)) continue;
    const fixture = ctx.fixtureByClub.get(clubId)!;
    if (fixture.homeScore == null) continue;
    const m = player.matches.find((x) => x.seasonId === seasonId && x.round === round);
    const projection = projectPlayer(snapshot, ctx, player, {}, { coefficients: opts.coefficients, clubId });
    out.push({
      seasonId,
      round,
      player,
      clubId,
      projection,
      actual: {
        rated: (m?.note ?? 0) > 0,
        started: m?.started ?? false,
        note: m?.note ?? 0,
        goals: m?.goals ?? 0,
      },
    });
  }
  return out;
}
