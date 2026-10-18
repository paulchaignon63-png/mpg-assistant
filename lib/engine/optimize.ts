/**
 * Choix du 11, du banc, de la formation et du capitaine.
 *
 * 1. Chaque joueur reçoit une valeur attendue : P(noté) × (note + buts), plus,
 *    s'il ne joue pas, la valeur d'un remplacement moyen. Le mode de jeu
 *    ajuste cette valeur par le risque (sûr : on pénalise l'incertitude ;
 *    coup de poker : on la valorise).
 * 2. Pour chaque formation, on prend les meilleurs par ligne (optimal pour une
 *    valeur additive) et on remplit le banc MPG (1 gardien + 6).
 * 3. Chaque candidat est simulé (Monte-Carlo, règles de remplacement MPG) et
 *    on garde la formation au meilleur objectif. Les totaux de toutes les
 *    formations sont renvoyés pour l'affichage.
 */

import {
  AVAILABLE_FORMATIONS,
  BENCH_SIZE,
  FORMATIONS,
  GOAL_VALUE,
  POSITIONS,
  ROTALDO_NOTE,
  type Pos,
} from "./mpg-rules";
import { simulateLineup, type LineupStats, type Projection } from "./simulate";

export type Mode = "safe" | "balanced" | "poker";

/** Poids du risque dans la valeur d'un joueur et l'objectif d'équipe. */
const RISK_WEIGHT: Record<Mode, number> = { safe: -0.5, balanced: 0, poker: 0.5 };

/** Valeur supposée d'un remplacement quand un titulaire ne joue pas. */
const FALLBACK_VALUE = 4.5;

/** Répartition cible du banc par formation (1 G + 6 de champ). */
const BENCH_TEMPLATES: Record<number, Record<Pos, number>> = {
  343: { G: 1, D: 2, M: 2, A: 2 },
  352: { G: 1, D: 2, M: 2, A: 2 },
  424: { G: 1, D: 2, M: 2, A: 2 },
  433: { G: 1, D: 2, M: 2, A: 2 },
  442: { G: 1, D: 2, M: 2, A: 2 },
  451: { G: 1, D: 2, M: 3, A: 1 },
  532: { G: 1, D: 2, M: 2, A: 2 },
  541: { G: 1, D: 2, M: 3, A: 1 },
};

/** Valeur attendue d'un joueur, hors effet de remplacement. */
export function expectedValue(p: Projection): number {
  return p.pPlay * (p.noteMean + GOAL_VALUE * p.goalRate) + (1 - p.pPlay) * FALLBACK_VALUE;
}

/** Écart-type approché de la contribution d'un joueur (note + incertitude de jouer). */
export function contributionSd(p: Projection): number {
  const playing = p.noteMean + GOAL_VALUE * p.goalRate;
  const spreadIfPlays = Math.sqrt(p.noteSd ** 2 + GOAL_VALUE ** 2 * p.goalRate);
  const variance =
    p.pPlay * spreadIfPlays ** 2 + p.pPlay * (1 - p.pPlay) * (playing - FALLBACK_VALUE) ** 2;
  return Math.sqrt(variance);
}

export function modeValue(p: Projection, mode: Mode): number {
  return expectedValue(p) + RISK_WEIGHT[mode] * contributionSd(p);
}

function objective(stats: LineupStats, mode: Mode): number {
  return stats.mean + RISK_WEIGHT[mode] * stats.sd;
}

export interface FormationOption {
  formation: number;
  /** Total moyen attendu. */
  mean: number;
  p10: number;
  p90: number;
  /** Pas assez de joueurs pour remplir les lignes de cette formation. */
  incomplete: boolean;
}

export interface LineupPlan {
  formation: number;
  starters: Projection[];
  /** Banc dans l'ordre de priorité des remplacements. */
  bench: Projection[];
  /** Joueurs non retenus. */
  out: Projection[];
  captainId: string | null;
  stats: LineupStats;
  formations: FormationOption[];
}

/** Clé d'une paire de concurrents, indépendante de l'ordre. */
export function rivalKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildCandidate(
  players: Projection[],
  formation: number,
  mode: Mode,
  rivals?: Set<string>
): { starters: Projection[]; bench: Projection[]; out: Projection[]; incomplete: boolean } {
  const f = FORMATIONS[formation];
  const byPos: Record<Pos, Projection[]> = { G: [], D: [], M: [], A: [] };
  for (const p of players) byPos[p.position].push(p);
  for (const pos of POSITIONS) byPos[pos].sort((a, b) => modeValue(b, mode) - modeValue(a, mode));

  const starters: Projection[] = [];
  let incomplete = false;
  for (const pos of POSITIONS) {
    // Deux concurrents directs (rarement titulaires ensemble dans leur club)
    // ne sont pas alignés ensemble tant qu'une autre option existe.
    const take: Projection[] = [];
    const skipped: Projection[] = [];
    for (const p of byPos[pos]) {
      if (take.length >= f[pos]) break;
      if (take.some((t) => rivals?.has(rivalKey(t.id, p.id)))) skipped.push(p);
      else take.push(p);
    }
    while (take.length < f[pos] && skipped.length) take.push(skipped.shift()!);
    if (take.length < f[pos]) incomplete = true;
    starters.push(...take);
  }
  const startIds = new Set(starters.map((p) => p.id));

  // Banc : d'abord la répartition cible, puis les meilleurs restants. On
  // ordonne par valeur ET par probabilité de jouer : un remplaçant qui ne
  // joue pas ne sert à rien.
  const benchValue = (p: Projection) => p.pPlay * (p.noteMean + GOAL_VALUE * p.goalRate);
  const template = BENCH_TEMPLATES[formation] ?? BENCH_TEMPLATES[343];
  const rest: Record<Pos, Projection[]> = { G: [], D: [], M: [], A: [] };
  for (const pos of POSITIONS) {
    rest[pos] = byPos[pos]
      .filter((p) => !startIds.has(p.id))
      .sort((a, b) => benchValue(b) - benchValue(a));
  }
  const bench: Projection[] = [];
  bench.push(...rest.G.slice(0, BENCH_SIZE.G));
  const outfield: Projection[] = [];
  for (const pos of ["D", "M", "A"] as const) outfield.push(...rest[pos].slice(0, template[pos]));
  const leftovers = (["D", "M", "A"] as const)
    .flatMap((pos) => rest[pos].slice(template[pos]))
    .sort((a, b) => benchValue(b) - benchValue(a));
  while (outfield.length < BENCH_SIZE.outfield && leftovers.length) outfield.push(leftovers.shift()!);
  outfield.sort((a, b) => benchValue(b) - benchValue(a));
  bench.push(...outfield.slice(0, BENCH_SIZE.outfield));

  const used = new Set([...starters, ...bench].map((p) => p.id));
  const out = players.filter((p) => !used.has(p.id));
  return { starters, bench, out, incomplete };
}

/**
 * Capitaine : le titulaire au meilleur plafond parmi ceux qui jouent presque
 * sûrement (un capitaine absent ne rapporte rien). En mode sûr, on vise la
 * meilleure espérance ; en coup de poker, le plus haut plafond.
 */
export function pickCaptain(starters: Projection[], mode: Mode): string | null {
  const reliable = starters.filter((p) => p.position !== "G" && p.pStart >= 0.7);
  const pool = reliable.length ? reliable : starters;
  if (pool.length === 0) return null;
  const z = mode === "safe" ? 0 : mode === "poker" ? 1.6 : 1.0;
  const score = (p: Projection) => p.pPlay * (p.noteMean + z * p.noteSd + GOAL_VALUE * p.goalRate);
  return [...pool].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0].id;
}

export function optimizeLineup(
  players: Projection[],
  opts: { formation?: number | "auto"; mode?: Mode; sims?: number; rivals?: Set<string> } = {}
): LineupPlan {
  const mode = opts.mode ?? "balanced";
  const sims = opts.sims ?? 1500;
  const formations: FormationOption[] = [];
  let best: (LineupPlan & { obj: number }) | null = null;

  for (const formation of AVAILABLE_FORMATIONS) {
    const c = buildCandidate(players, formation, mode, opts.rivals);
    const stats = simulateLineup(c.starters, c.bench, { sims });
    formations.push({ formation, mean: stats.mean, p10: stats.p10, p90: stats.p90, incomplete: c.incomplete });

    const forced = typeof opts.formation === "number";
    const eligible = forced ? formation === opts.formation : !c.incomplete;
    if (!eligible) continue;
    const obj = objective(stats, mode);
    if (!best || obj > best.obj) {
      best = {
        formation,
        starters: c.starters,
        bench: c.bench,
        out: c.out,
        captainId: pickCaptain(c.starters, mode),
        stats,
        formations,
        obj,
      };
    }
  }

  if (!best) {
    // Effectif trop court pour toute formation : on prend la moins incomplète.
    const fallback = formations.sort((a, b) => b.mean - a.mean)[0]?.formation ?? 343;
    const c = buildCandidate(players, fallback, mode, opts.rivals);
    const stats = simulateLineup(c.starters, c.bench, { sims });
    best = { formation: fallback, ...c, captainId: pickCaptain(c.starters, mode), stats, formations, obj: 0 };
  }

  const { obj: _obj, ...plan } = best;
  void _obj;
  return { ...plan, formations: [...formations].sort((a, b) => a.formation - b.formation) };
}

/** Note d'équipe sur 100 à partir du total attendu (bornes : équipe faible / équipe de rêve). */
export const TEAM_SCORE_RANGE = { low: 50, high: 72 };

export function teamScore100(mean: number): number {
  const { low, high } = TEAM_SCORE_RANGE;
  return Math.round(Math.min(100, Math.max(0, ((mean - low) / (high - low)) * 100)));
}

export { ROTALDO_NOTE };
