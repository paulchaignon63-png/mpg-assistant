/**
 * Banc d'essai : rejoue les journées passées avec les seules informations
 * connues avant le match, puis compare aux vrais résultats.
 *
 * Trois mesures :
 *  1. précision de la note attendue (erreur moyenne) face à la moyenne de
 *     saison du joueur ;
 *  2. justesse de P(titulaire) (score de Brier) face au taux de
 *     titularisation récent ;
 *  3. points réels d'un 11 choisi par chaque moteur sur des effectifs tirés
 *     au hasard (2 G, 6 D, 6 M, 4 A), règles de remplacement MPG comprises.
 *
 * Limites, assumées : la cote MPG et l'Elo des clubs sont ceux d'aujourd'hui
 * (légère fuite d'information, identique pour les deux moteurs) et les cotes
 * des bookmakers ne sont connues que pour les matchs à venir.
 */

import type { ChampionshipSnapshot } from "../data/mpgstats";
import { backtestRounds, samplesForRound, type Sample } from "./dataset";
import { optimizeLineup } from "./optimize";
import { makeRng, scoreActual, type Projection } from "./simulate";
import type { ModelCoefficients } from "./model";
import { getRecommendedTeamWithSubstitutes, type PoolPlayer } from "../recommendation";

export interface RoundResult {
  seasonId: number;
  round: number;
  /** Points moyens par effectif tiré : nouveau moteur, ancien, choix naïf. */
  newPoints: number;
  oldPoints: number;
  naivePoints: number;
  noteMae: number;
  baselineMae: number;
}

export interface BacktestSummary {
  championshipId: string;
  rounds: number;
  squadsPerRound: number;
  newPoints: number;
  oldPoints: number;
  naivePoints: number;
  /** Part des effectifs où le nouveau moteur fait mieux que l'ancien. */
  newBeatsOld: number;
  noteMae: number;
  baselineMae: number;
  startBrier: number;
  baselineBrier: number;
  perRound: RoundResult[];
  generatedAt: string;
}

/** Joueur au format de l'ancien moteur, reconstruit à la date de la journée. */
function legacyPlayer(s: Sample): PoolPlayer & { position: string } {
  const season = s.player.matches
    .filter((m) => m.seasonId === s.seasonId && m.round < s.round)
    .sort((a, b) => b.round - a.round);
  const rated = season.filter((m) => m.note > 0);
  const last5 = season.slice(0, 5);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
  const l3 = avg(rated.slice(0, 3).map((m) => m.note));
  const p3 = avg(rated.slice(3, 6).map((m) => m.note));
  return {
    id: s.player.id,
    name: s.player.name,
    position: s.player.position,
    clubName: s.projection.club,
    // Même cote « à la date » que le nouveau moteur, pour une comparaison loyale.
    quotation: s.projection.features.quotation * 50,
    average: avg(rated.map((m) => m.note)) ?? 0,
    matchs: rated.length,
    goals: rated.reduce((a, m) => a + m.goals, 0),
    averageLast5: avg(last5.filter((m) => m.note > 0).map((m) => m.note)),
    momentum: l3 != null && p3 != null ? l3 - p3 : undefined,
    last5Notes: last5.map((m) => m.note),
    last5Minutes: last5.map((m) => m.minutes),
    pctTitularisations: s.player.startRate,
    nextOpponentRank: s.projection.opponentRank,
    isHome: s.projection.isHome,
    teamRank: s.projection.teamRank,
    isInjured: s.projection.status === "injured",
    isSuspended: s.projection.status === "suspended",
    isDoubtful: s.projection.status === "doubtful",
  };
}

const QUOTAS = { G: 2, D: 6, M: 6, A: 4 } as const;

function drawSquad(pool: Sample[], rng: () => number): Sample[] | null {
  const out: Sample[] = [];
  for (const pos of ["G", "D", "M", "A"] as const) {
    const cands = pool.filter((s) => s.player.position === pos);
    if (cands.length < QUOTAS[pos]) return null;
    const picked = new Set<number>();
    while (picked.size < QUOTAS[pos]) picked.add(Math.floor(rng() * cands.length));
    for (const i of picked) out.push(cands[i]);
  }
  return out;
}

function actualMap(squad: Sample[]): Map<string, { note: number; goals: number }> {
  return new Map(squad.map((s) => [s.player.id, { note: s.actual.note, goals: s.actual.goals }]));
}

/** 11 « naïf » : meilleure moyenne de saison par ligne, en 4-4-2, banc par moyenne. */
function naivePick(squad: Sample[]): { starters: Projection[]; bench: Projection[] } {
  const need = { G: 1, D: 4, M: 4, A: 2 } as const;
  const starters: Projection[] = [];
  const bench: Projection[] = [];
  for (const pos of ["G", "D", "M", "A"] as const) {
    const line = squad
      .filter((s) => s.player.position === pos)
      .sort((a, b) => b.projection.features.seasonNote - a.projection.features.seasonNote)
      .map((s) => s.projection);
    starters.push(...line.slice(0, need[pos]));
    bench.push(...line.slice(need[pos]));
  }
  return { starters, bench: bench.slice(0, 7) };
}

function legacyPick(squad: Sample[], totalTeams: number): { starters: Projection[]; bench: Projection[] } {
  const pool = squad.map(legacyPlayer);
  const squadObj: Record<string, unknown> = {};
  for (const s of squad) squadObj[s.player.id] = { id: s.player.id };
  const { recommended, substitutes } = getRecommendedTeamWithSubstitutes(squadObj, 343, pool, {
    championshipDays: Math.max(1, squad[0]?.projection.features.seasonRounds ?? 10),
    totalTeams,
  });
  const byId = new Map(squad.map((s) => [s.player.id, s.projection]));
  const starters = recommended.map((p) => byId.get(p.id ?? "")!).filter(Boolean);
  const bench = (["G", "D", "M", "A"] as const)
    .flatMap((pos) => substitutes[pos] ?? [])
    .map((p) => byId.get(p.id ?? "")!)
    .filter(Boolean);
  return { starters, bench };
}

export function runBacktest(
  snapshot: ChampionshipSnapshot,
  opts: {
    coefficients?: ModelCoefficients;
    squadsPerRound?: number;
    sims?: number;
    seed?: number;
    /** Ne rejouer que ces saisons (ex. saison en cours pour un test hors échantillon). */
    seasons?: number[];
    onRound?: (r: RoundResult) => void;
  } = {}
): BacktestSummary {
  const squadsPerRound = opts.squadsPerRound ?? 60;
  const rng = makeRng(opts.seed ?? 2026);
  const perRound: RoundResult[] = [];
  let beats = 0;
  let duels = 0;
  let brier = 0;
  let brierBase = 0;
  let brierN = 0;

  for (const { seasonId, round } of backtestRounds(snapshot)) {
    if (opts.seasons && !opts.seasons.includes(seasonId)) continue;
    const samples = samplesForRound(snapshot, seasonId, round, { coefficients: opts.coefficients });
    if (samples.length < 100) continue;

    // Précision de la note et de P(titulaire).
    let mae = 0;
    let maeBase = 0;
    let nRated = 0;
    for (const s of samples) {
      if (s.actual.rated) {
        mae += Math.abs(s.projection.noteMean - s.actual.note);
        maeBase += Math.abs(s.projection.features.seasonNote - s.actual.note);
        nRated++;
      }
      const y = s.actual.started ? 1 : 0;
      brier += (s.projection.pStart - y) ** 2;
      brierBase += (s.projection.features.started5 - y) ** 2;
      brierN++;
    }

    // Effectifs tirés parmi les joueurs « de rotation » (déjà notés cette saison).
    const pool = samples.filter((s) => s.projection.features.seasonRounds > 0 && s.projection.features.rated5 > 0);
    let sumNew = 0;
    let sumOld = 0;
    let sumNaive = 0;
    let n = 0;
    for (let k = 0; k < squadsPerRound; k++) {
      const squad = drawSquad(pool, rng);
      if (!squad) break;
      const actual = actualMap(squad);
      const plan = optimizeLineup(
        squad.map((s) => s.projection),
        { formation: "auto", mode: "balanced", sims: opts.sims ?? 150 }
      );
      const a = scoreActual(plan.starters, plan.bench, actual).total;
      const legacy = legacyPick(squad, snapshot.currentClubIds.length || 18);
      const b = scoreActual(legacy.starters, legacy.bench, actual).total;
      const naive = naivePick(squad);
      const c = scoreActual(naive.starters, naive.bench, actual).total;
      sumNew += a;
      sumOld += b;
      sumNaive += c;
      if (a !== b) {
        duels++;
        if (a > b) beats++;
      }
      n++;
    }
    if (n === 0) continue;
    const r: RoundResult = {
      seasonId,
      round,
      newPoints: sumNew / n,
      oldPoints: sumOld / n,
      naivePoints: sumNaive / n,
      noteMae: nRated ? mae / nRated : 0,
      baselineMae: nRated ? maeBase / nRated : 0,
    };
    perRound.push(r);
    opts.onRound?.(r);
  }

  const mean = (k: keyof RoundResult) =>
    perRound.length ? perRound.reduce((a, r) => a + (r[k] as number), 0) / perRound.length : 0;
  return {
    championshipId: snapshot.championshipId,
    rounds: perRound.length,
    squadsPerRound,
    newPoints: mean("newPoints"),
    oldPoints: mean("oldPoints"),
    naivePoints: mean("naivePoints"),
    newBeatsOld: duels ? beats / duels : 0.5,
    noteMae: mean("noteMae"),
    baselineMae: mean("baselineMae"),
    startBrier: brierN ? brier / brierN : 0,
    baselineBrier: brierN ? brierBase / brierN : 0,
    perRound,
    generatedAt: new Date().toISOString(),
  };
}
