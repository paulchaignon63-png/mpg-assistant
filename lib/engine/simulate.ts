/**
 * Simulation Monte-Carlo d'une journée MPG.
 *
 * Chaque tirage décide, pour chaque joueur, s'il est noté (a joué), sa note et
 * ses buts, puis applique les remplacements MPG : remplaçant du même poste
 * d'abord, sinon d'une ligne voisine avec −1 par ligne sautée, sinon Rotaldo.
 * On en tire la distribution du total de l'équipe (moyenne, plancher,
 * plafond), qui sert à choisir la formation, le banc et le capitaine.
 */

import {
  CHEAT_CODE_MALUS,
  GOAL_VALUE,
  LINE_INDEX,
  LINE_SKIP_PENALTY,
  MPG_GOAL,
  NOTE_MAX,
  NOTE_MIN,
  ROTALDO_NOTE,
  type Pos,
} from "./mpg-rules";

/** Ce que le moteur prévoit pour un joueur sur la prochaine journée. */
export interface Projection {
  id: string;
  name: string;
  club: string;
  position: Pos;
  /** Probabilité d'être titulaire. */
  pStart: number;
  /** Probabilité d'être noté (titulaire, ou entré assez longtemps). */
  pPlay: number;
  /** Note attendue s'il est noté. */
  noteMean: number;
  /** Écart-type de la note s'il est noté. */
  noteSd: number;
  /** Buts attendus s'il est noté (paramètre de Poisson). */
  goalRate: number;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function makeRng(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number): number {
  // Box-Muller
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 10);
  return k - 1;
}

interface Outcome {
  played: boolean;
  note: number;
  goals: number;
}

function sampleOutcome(p: Projection, rng: () => number): Outcome {
  if (rng() >= p.pPlay) return { played: false, note: 0, goals: 0 };
  const raw = p.noteMean + p.noteSd * normal(rng);
  const note = Math.min(NOTE_MAX, Math.max(NOTE_MIN, Math.round(raw * 2) / 2));
  return { played: true, note, goals: poisson(p.goalRate, rng) };
}

/** Joueur effectivement aligné à l'issue des remplacements. */
interface Slot {
  position: Pos;
  playerId: string | null; // null = Rotaldo
  note: number;
  goals: number;
  fromBench: boolean;
}

/**
 * Applique les remplacements MPG pour un tirage donné.
 * `bench` est dans l'ordre de priorité choisi par l'utilisateur / le moteur.
 */
function resolveLineup(
  starters: Projection[],
  bench: Projection[],
  outcomes: Map<string, Outcome>
): Slot[] {
  const used = new Set<string>();
  const slots: Slot[] = [];
  for (const s of starters) {
    const o = outcomes.get(s.id)!;
    if (o.played) {
      slots.push({ position: s.position, playerId: s.id, note: o.note, goals: o.goals, fromBench: false });
      continue;
    }
    let chosen: { p: Projection; distance: number } | null = null;
    const maxDistance = s.position === "G" ? 0 : 2;
    for (let d = 0; d <= maxDistance && !chosen; d++) {
      for (const b of bench) {
        if (used.has(b.id)) continue;
        if (b.position === "G" && s.position !== "G") continue;
        if (Math.abs(LINE_INDEX[b.position] - LINE_INDEX[s.position]) !== d) continue;
        if (!outcomes.get(b.id)!.played) continue;
        chosen = { p: b, distance: d };
        break;
      }
    }
    if (chosen) {
      used.add(chosen.p.id);
      const o2 = outcomes.get(chosen.p.id)!;
      slots.push({
        position: s.position,
        playerId: chosen.p.id,
        note: Math.max(NOTE_MIN, o2.note - chosen.distance * LINE_SKIP_PENALTY),
        goals: o2.goals,
        fromBench: true,
      });
    } else {
      slots.push({ position: s.position, playerId: null, note: ROTALDO_NOTE, goals: 0, fromBench: true });
    }
  }
  return slots;
}

function teamValue(slots: Slot[], malus = 0): number {
  let v = 0;
  for (const s of slots) {
    const note = s.position !== "G" && s.playerId ? s.note - malus : s.note;
    v += note + GOAL_VALUE * s.goals;
  }
  return v;
}

export interface LineupStats {
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
  /** Probabilité de devoir aligner Rotaldo au moins une fois. */
  rotaldoRate: number;
  /** Fréquence d'entrée de chaque remplaçant. */
  benchUsage: Record<string, number>;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/** Distribution du total d'une équipe (titulaires + banc ordonné). */
export function simulateLineup(
  starters: Projection[],
  bench: Projection[],
  opts: { sims?: number; seed?: number; cheatCodeAgainst?: boolean } = {}
): LineupStats {
  const sims = opts.sims ?? 2000;
  const rng = makeRng(opts.seed ?? 7);
  const malus = opts.cheatCodeAgainst ? CHEAT_CODE_MALUS : 0;
  const all = [...starters, ...bench];
  const values: number[] = [];
  const usage: Record<string, number> = {};
  let rotaldo = 0;
  for (let i = 0; i < sims; i++) {
    const outcomes = new Map<string, Outcome>();
    for (const p of all) outcomes.set(p.id, sampleOutcome(p, rng));
    const slots = resolveLineup(starters, bench, outcomes);
    values.push(teamValue(slots, malus));
    let hadRotaldo = false;
    for (const s of slots) {
      if (s.fromBench && s.playerId) usage[s.playerId] = (usage[s.playerId] ?? 0) + 1;
      if (s.playerId === null) hadRotaldo = true;
    }
    if (hadRotaldo) rotaldo++;
  }
  const mean = values.reduce((a, b) => a + b, 0) / sims;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / sims);
  const sorted = [...values].sort((a, b) => a - b);
  for (const k of Object.keys(usage)) usage[k] /= sims;
  return {
    mean,
    sd,
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    rotaldoRate: rotaldo / sims,
    benchUsage: usage,
  };
}

/**
 * Total réel d'une équipe, à partir des vraies notes de la journée (banc
 * d'essai). `actual` donne, par id, la note (0 = non noté) et les buts.
 */
export function scoreActual(
  starters: Projection[],
  bench: Projection[],
  actual: Map<string, { note: number; goals: number }>
): { total: number; rotaldo: number } {
  const outcomes = new Map<string, Outcome>();
  for (const p of [...starters, ...bench]) {
    const a = actual.get(p.id);
    outcomes.set(p.id, a && a.note > 0 ? { played: true, note: a.note, goals: a.goals } : { played: false, note: 0, goals: 0 });
  }
  const slots = resolveLineup(starters, bench, outcomes);
  return { total: teamValue(slots), rotaldo: slots.filter((s) => s.playerId === null).length };
}

function lineAverage(slots: Slot[], pos: Pos): number | null {
  const notes = slots.filter((s) => s.position === pos).map((s) => s.note);
  return notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
}

/** Buts MPG d'une équipe face à une autre, pour un tirage (règle approchée). */
function mpgGoals(attack: Slot[], defense: Slot[]): number {
  let goals = attack.reduce((a, s) => a + s.goals, 0);
  const mid = lineAverage(defense, "M");
  const def = lineAverage(defense, "D");
  const gk = lineAverage(defense, "G");
  for (const s of attack) {
    if (s.goals > 0 || !MPG_GOAL.eligible.includes(s.position)) continue;
    if (s.note < MPG_GOAL.minNote) continue;
    if (mid != null && s.note <= mid) continue;
    if (def != null && s.note <= def - MPG_GOAL.defenseOffset) continue;
    if (gk != null && s.note <= gk) continue;
    goals++;
  }
  return goals;
}

export interface MatchupStats {
  win: number;
  draw: number;
  loss: number;
  /** Écart moyen de buts MPG (positif = on gagne). */
  goalDiff: number;
}

/** Probabilités de victoire / nul / défaite contre une équipe adverse. */
export function simulateMatchup(
  us: { starters: Projection[]; bench: Projection[] },
  them: { starters: Projection[]; bench: Projection[] },
  opts: { sims?: number; seed?: number; theyPlayCheatCode?: boolean; wePlayCheatCode?: boolean } = {}
): MatchupStats {
  const sims = opts.sims ?? 2000;
  const rng = makeRng(opts.seed ?? 11);
  let win = 0;
  let draw = 0;
  let diff = 0;
  const applyMalus = (slots: Slot[], on: boolean) =>
    on
      ? slots.map((s) =>
          s.position !== "G" && s.playerId ? { ...s, note: Math.max(NOTE_MIN, s.note - CHEAT_CODE_MALUS) } : s
        )
      : slots;
  // Le Cheat Code se retourne contre son lanceur si les deux le jouent.
  const bothCheat = opts.theyPlayCheatCode && opts.wePlayCheatCode;
  for (let i = 0; i < sims; i++) {
    const outcomes = new Map<string, Outcome>();
    for (const p of [...us.starters, ...us.bench, ...them.starters, ...them.bench]) {
      if (!outcomes.has(p.id)) outcomes.set(p.id, sampleOutcome(p, rng));
    }
    let ours = resolveLineup(us.starters, us.bench, outcomes);
    let theirs = resolveLineup(them.starters, them.bench, outcomes);
    if (bothCheat) {
      ours = applyMalus(ours, true);
      theirs = applyMalus(theirs, true);
    } else {
      ours = applyMalus(ours, !!opts.theyPlayCheatCode);
      theirs = applyMalus(theirs, !!opts.wePlayCheatCode);
    }
    const a = mpgGoals(ours, theirs);
    const b = mpgGoals(theirs, ours);
    if (a > b) win++;
    else if (a === b) draw++;
    diff += a - b;
  }
  return { win: win / sims, draw: draw / sims, loss: 1 - (win + draw) / sims, goalDiff: diff / sims };
}
