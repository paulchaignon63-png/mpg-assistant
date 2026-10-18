/**
 * Point d'entrée unique du moteur : un effectif (ids MPGStats) → le 11, le
 * banc ordonné, la formation, le capitaine, les remplacements tactiques, la
 * et la note d'équipe.
 *
 * Tous les parcours (ligue créée à la main, import MPG, alertes, extension)
 * passent par ici : il n'y a plus qu'un moteur.
 */

import { loadChampionship, type ChampionshipSnapshot, type Player } from "../data/mpgstats";
import { getEuroFixtures, findEuroFixture } from "../euro-fixtures";
import { getLineupSignals, type LineupBundle } from "../sources/lineups";
import { getScorerOdds, oddsApiEnabled } from "../sources/odds-api";
import { buildTacticalSubs, type SubCandidate, type TacticalSub } from "../tactical-subs";
import { expectedValue, optimizeLineup, rivalKey, teamScore100, type FormationOption, type Mode } from "./optimize";
import { COEFFICIENTS } from "./model";
import { nextRound, projectPlayers, roundContext, type PlayerProjection, type RoundContext, type Signals } from "./project";
import { formatFormation } from "./mpg-rules";
import { shortName } from "../names";

// --- Données de la journée, mises en cache quelques minutes -----------------------

export interface RoundData {
  snapshot: ChampionshipSnapshot;
  round: number;
  ctx: RoundContext;
  lineups: LineupBundle;
  scorerOdds: Map<string, number>;
  midweek: Map<number, { before: boolean; after: boolean; competition?: string }>;
  loadedAt: number;
}

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, Promise<RoundData | null>>();
const cacheAt = new Map<string, number>();

async function buildRoundData(championshipId: string): Promise<RoundData | null> {
  const snapshot = await loadChampionship(championshipId);
  if (!snapshot) return null;
  const round = nextRound(snapshot);
  if (round == null) return null;
  const ctx = roundContext(snapshot, snapshot.currentSeasonId, round);

  const [lineups, scorerOdds, euro] = await Promise.all([
    getLineupSignals(snapshot, ctx).catch(
      (): LineupBundle => ({ signals: new Map(), predictions: [], sources: [] })
    ),
    oddsApiEnabled() ? getScorerOdds(snapshot, ctx.firstKickoff).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
    getEuroFixtures(ctx.firstKickoff ? new Date(ctx.firstKickoff * 1000) : undefined).catch(() => new Map()),
  ]);

  const midweek = new Map<number, { before: boolean; after: boolean; competition?: string }>();
  for (const clubId of ctx.fixtureByClub.keys()) {
    const club = snapshot.clubs.get(clubId);
    const fx = findEuroFixture(euro, club?.longName ?? club?.name) ?? findEuroFixture(euro, club?.name);
    if (fx) midweek.set(clubId, { before: fx.before, after: !fx.before, competition: fx.competition });
  }

  return { snapshot, round, ctx, lineups, scorerOdds, midweek, loadedAt: Date.now() };
}

export function getRoundData(championshipId: string): Promise<RoundData | null> {
  const at = cacheAt.get(championshipId) ?? 0;
  if (!cache.has(championshipId) || Date.now() - at > CACHE_MS) {
    const p = buildRoundData(championshipId).catch(() => null);
    cache.set(championshipId, p);
    cacheAt.set(championshipId, Date.now());
  }
  return cache.get(championshipId)!;
}

// --- Recommandation ---------------------------------------------------------

export interface RecommendInput {
  championshipId: string;
  playerIds: string[];
  mode?: Mode;
  formation?: number | "auto";
  /** Hypothèses « et si » : probabilité de titularisation imposée. */
  overrides?: Record<string, number>;
  sims?: number;
}

export interface SquadPlayer extends PlayerProjection {
  role: "starter" | "bench" | "out";
  /** Rang dans l'ordre du banc (1 = premier remplaçant). */
  benchOrder?: number;
  /** Valeur attendue (note + buts, compte tenu de P(noté)). */
  value: number;
}

export interface RecommendResult {
  round: number;
  firstKickoff: number;
  formation: number;
  formations: FormationOption[];
  mode: Mode;
  players: SquadPlayer[];
  captainId: string | null;
  teamScore: number;
  stats: { mean: number; p10: number; p90: number; rotaldoRate: number };
  summary: string;
  tacticalSubs: Array<TacticalSub & { threshold?: number }>;
  lineupSources: LineupBundle["sources"];
  oddsAvailable: { matchOdds: boolean; scorerOdds: boolean };
  modelVersion: string;
  unknownIds: string[];
}

/**
 * Concurrents directs : même club, même poste, et rarement titulaires
 * ensemble sur les 10 dernières journées où l'un des deux l'a été.
 */
function rivalPairs(players: Player[], seasonId: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.clubId == null || a.clubId !== b.clubId || a.position !== b.position) continue;
      const startsA = new Set(a.matches.filter((m) => m.seasonId === seasonId && m.started).map((m) => m.round));
      const startsB = new Set(b.matches.filter((m) => m.seasonId === seasonId && m.started).map((m) => m.round));
      const rounds = [...new Set([...startsA, ...startsB])].sort((x, y) => y - x).slice(0, 10);
      if (rounds.length < 4) continue;
      const together = rounds.filter((r) => startsA.has(r) && startsB.has(r)).length;
      if (together / rounds.length < 0.3) out.add(rivalKey(a.id, b.id));
    }
  }
  return out;
}

function buildSummary(r: { teamScore: number; players: SquadPlayer[]; rotaldoRate: number; formation: number }): string {
  const starters = r.players.filter((p) => p.role === "starter");
  const risks = starters
    .filter((p) => p.pStart < 0.7 || p.status === "doubtful" || p.midweek)
    .sort((a, b) => a.pStart - b.pStart)
    .slice(0, 3);
  const level =
    r.teamScore >= 75 ? "11 très solide" : r.teamScore >= 55 ? "11 solide" : r.teamScore >= 35 ? "11 correct" : "11 fragile";
  const riskText = risks.length
    ? `${risks.length} risque${risks.length > 1 ? "s" : ""} (${risks
        .map((p) =>
          p.midweek && p.pStart >= 0.7
            ? `${shortName(p.name)}, ${p.midweek.competition ?? "coupe d'Europe"}`
            : `${shortName(p.name)} ${Math.round(p.pStart * 100)} %`
        )
        .join(", ")})`
    : "aucun titulaire incertain";
  const rotaldo = r.rotaldoRate >= 0.1 ? ` Attention : ${Math.round(r.rotaldoRate * 100)} % de risque d'aligner Rotaldo, renforce le banc.` : "";
  return `${level} en ${formatFormation(r.formation)}, ${riskText}.${rotaldo}`;
}

function toCandidate(p: SquadPlayer, player: Player | undefined, seasonId: number): SubCandidate {
  const last5 = (player?.matches ?? [])
    .filter((m) => m.seasonId === seasonId)
    .sort((a, b) => b.round - a.round)
    .slice(0, 5);
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    clubName: p.club,
    score: p.value,
    isDoubtful: p.status === "doubtful",
    pctTitularisations: p.pStart,
    nextOpponentRank: p.opponentRank,
    isHome: p.isHome,
    averageLast5: p.lastNotes.filter((n) => n > 0).length
      ? p.lastNotes.filter((n) => n > 0).reduce((a, b) => a + b, 0) / p.lastNotes.filter((n) => n > 0).length
      : undefined,
    last5Minutes: last5.map((m) => m.minutes),
    midweekBefore: p.midweek?.before,
    midweekAfter: p.midweek?.after,
    midweekCompetition: p.midweek?.competition,
  };
}

export async function recommend(input: RecommendInput): Promise<RecommendResult | { error: string }> {
  const data = await getRoundData(input.championshipId);
  if (!data) return { error: "Données du championnat indisponibles pour le moment." };
  const { snapshot, ctx } = data;
  const byId = new Map(snapshot.players.map((p) => [p.id, p]));
  const squad = input.playerIds.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const unknownIds = input.playerIds.filter((id) => !byId.has(id));
  if (squad.length === 0) return { error: "Aucun joueur de l'effectif n'est reconnu." };

  const signals: Signals = {
    lineups: data.lineups.signals,
    scorerOdds: data.scorerOdds,
    midweek: data.midweek,
    overrides: new Map(Object.entries(input.overrides ?? {}).map(([id, p]) => [id, { pStart: p }])),
  };
  const projections = projectPlayers(snapshot, ctx, squad, signals);
  const mode = input.mode ?? "balanced";
  const plan = optimizeLineup(projections, {
    formation: input.formation ?? "auto",
    mode,
    sims: input.sims ?? 1500,
    rivals: rivalPairs(squad, snapshot.currentSeasonId),
  });

  const role = new Map<string, SquadPlayer["role"]>();
  plan.starters.forEach((p) => role.set(p.id, "starter"));
  plan.bench.forEach((p) => role.set(p.id, "bench"));
  const benchOrder = new Map(plan.bench.map((p, i) => [p.id, i + 1]));
  const players: SquadPlayer[] = projections.map((p) => ({
    ...p,
    role: role.get(p.id) ?? "out",
    benchOrder: benchOrder.get(p.id),
    value: expectedValue(p),
  }));

  const teamScore = teamScore100(plan.stats.mean);
  const starters = players.filter((p) => p.role === "starter");
  const bench = players.filter((p) => p.role === "bench");
  const tacticalSubs = buildTacticalSubs(
    starters.map((p) => toCandidate(p, byId.get(p.id), snapshot.currentSeasonId)),
    // Un remplaçant qui ne jouera pas ne couvre personne.
    bench.filter((p) => p.pPlay >= 0.15).map((p) => toCandidate(p, byId.get(p.id), snapshot.currentSeasonId)),
    ctx.totalTeams
  ).map((s) => {
    const inPlayer = players.find((p) => p.id === s.in.id);
    // Seuil MPG : le remplaçant entre si la note du titulaire est sous ce seuil.
    const threshold =
      s.kind === "securite" || !inPlayer ? undefined : Math.max(4, Math.floor((inPlayer.noteMean - 0.25) * 2) / 2);
    return { ...s, threshold };
  });

  return {
    round: data.round,
    firstKickoff: ctx.firstKickoff,
    formation: plan.formation,
    formations: plan.formations,
    mode,
    players,
    captainId: plan.captainId,
    teamScore,
    stats: { mean: plan.stats.mean, p10: plan.stats.p10, p90: plan.stats.p90, rotaldoRate: plan.stats.rotaldoRate },
    summary: buildSummary({ teamScore, players, rotaldoRate: plan.stats.rotaldoRate, formation: plan.formation }),
    tacticalSubs,
    lineupSources: data.lineups.sources,
    oddsAvailable: {
      matchOdds: [...ctx.fixtureByClub.values()].some((f) => !!f.odds),
      scorerOdds: data.scorerOdds.size > 0,
    },
    modelVersion: COEFFICIENTS.version,
    unknownIds,
  };
}
