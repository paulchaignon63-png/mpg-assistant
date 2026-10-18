/**
 * Projections des joueurs pour une journée : P(titulaire), P(noté), note
 * attendue, buts attendus, avec le « pourquoi » chiffré.
 *
 * Fonctionne pour la prochaine journée (reco du jour) comme pour une journée
 * passée (banc d'essai) : seules les informations antérieures au coup d'envoi
 * sont lues, sauf le statut publié pour ce match et l'Elo actuel des clubs.
 */

import type {
  ChampionshipSnapshot,
  Fixture,
  Player,
  PlayerStatus,
} from "../data/mpgstats";
import { quotationAt, statusForEvents, yellowCardsInLast } from "../data/mpgstats";
import { buildFeatures, type Features, type RawMatch } from "./features";
import { explainNote, predict, type NoteContribution, COEFFICIENTS, type ModelCoefficients } from "./model";
import type { Projection } from "./simulate";
import type { Pos } from "./mpg-rules";

// --- Signaux extérieurs -------------------------------------------------------

export interface LineupSignal {
  /** Probabilité d'être titulaire selon les compos probables (agrégées). */
  pStart: number;
  /** Compo officielle publiée. */
  confirmed: boolean;
  /** Poids à donner au signal (fiabilité mesurée de la source). */
  weight: number;
  sources: string[];
}

export interface Signals {
  lineups?: Map<string, LineupSignal>;
  /** Probabilité « buteur à tout moment » des bookmakers. */
  scorerOdds?: Map<string, number>;
  /** Hypothèses modifiées par l'utilisateur (« et si »). */
  overrides?: Map<string, { pStart?: number }>;
  /** Coupe d'Europe autour de la journée, par id de club. */
  midweek?: Map<number, { before: boolean; after: boolean; competition?: string }>;
}

// --- Contexte d'une journée ----------------------------------------------------

export interface RoundContext {
  seasonId: number;
  round: number;
  /** Matchs de la journée, par id de club. */
  fixtureByClub: Map<number, Fixture>;
  /** Rang de force de chaque club avant la journée (1 = le plus fort). */
  rankByClub: Map<number, number>;
  totalTeams: number;
  /** Ids des événements de la journée (pour les statuts). */
  eventIds: Set<number>;
  firstKickoff: number;
}

/** Points par match moyens d'une équipe de Ligue 1, et pondération de l'Elo. */
const ELO_PRIOR_MATCHES = 5;

/**
 * Classement de force avant la journée : points par match des journées
 * précédentes, ramenés vers l'Elo (qui seul compte en début de saison).
 */
export function strengthRanks(snapshot: ChampionshipSnapshot, seasonId: number, round: number): Map<number, number> {
  const seasonFixtures = snapshot.fixtures.filter((f) => f.seasonId === seasonId);
  const clubIds = new Set<number>();
  for (const f of seasonFixtures) {
    clubIds.add(f.homeId);
    clubIds.add(f.awayId);
  }
  const elos = [...clubIds].map((id) => snapshot.clubs.get(id)?.elo ?? 1500);
  const meanElo = elos.reduce((a, b) => a + b, 0) / Math.max(1, elos.length);
  const sdElo = Math.sqrt(elos.reduce((a, b) => a + (b - meanElo) ** 2, 0) / Math.max(1, elos.length)) || 1;

  const pts = new Map<number, { p: number; n: number }>();
  for (const f of seasonFixtures) {
    if (f.round >= round || f.homeScore == null || f.awayScore == null) continue;
    const h = pts.get(f.homeId) ?? { p: 0, n: 0 };
    const a = pts.get(f.awayId) ?? { p: 0, n: 0 };
    h.n++;
    a.n++;
    if (f.homeScore > f.awayScore) h.p += 3;
    else if (f.homeScore < f.awayScore) a.p += 3;
    else {
      h.p++;
      a.p++;
    }
    pts.set(f.homeId, h);
    pts.set(f.awayId, a);
  }

  const strength = [...clubIds].map((id) => {
    const elo = snapshot.clubs.get(id)?.elo ?? meanElo;
    const eloPpg = 1.4 + ((elo - meanElo) / sdElo) * 0.45;
    const r = pts.get(id) ?? { p: 0, n: 0 };
    return { id, s: (r.p + eloPpg * ELO_PRIOR_MATCHES) / (r.n + ELO_PRIOR_MATCHES) };
  });
  strength.sort((a, b) => b.s - a.s || a.id - b.id);
  return new Map(strength.map((x, i) => [x.id, i + 1]));
}

export function roundContext(snapshot: ChampionshipSnapshot, seasonId: number, round: number): RoundContext {
  const fixtures = snapshot.fixtures.filter((f) => f.seasonId === seasonId && f.round === round);
  const fixtureByClub = new Map<number, Fixture>();
  for (const f of fixtures) {
    fixtureByClub.set(f.homeId, f);
    fixtureByClub.set(f.awayId, f);
  }
  const rankByClub = strengthRanks(snapshot, seasonId, round);
  return {
    seasonId,
    round,
    fixtureByClub,
    rankByClub,
    totalTeams: rankByClub.size || 18,
    eventIds: new Set(fixtures.map((f) => f.id)),
    firstKickoff: fixtures.length ? Math.min(...fixtures.map((f) => f.kickoff)) : 0,
  };
}

/** Prochaine journée de la saison en cours (premier match non encore commencé). */
export function nextRound(snapshot: ChampionshipSnapshot, now = Date.now() / 1000): number | null {
  const future = snapshot.fixtures
    .filter((f) => f.seasonId === snapshot.currentSeasonId && f.kickoff > now)
    .sort((a, b) => a.kickoff - b.kickoff);
  return future[0]?.round ?? null;
}

// --- Cotes → buts attendus ---------------------------------------------------

function poissonPmf(k: number, l: number): number {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

const lambdaCache = new Map<string, { home: number; away: number }>();

/**
 * Buts attendus des deux équipes cohérents avec les cotes 1-N-2 (modèle de
 * Poisson indépendant, recherche sur grille).
 */
export function lambdasFromOdds(o: { home: number; draw: number; away: number }): { home: number; away: number } {
  const key = `${o.home.toFixed(3)}|${o.draw.toFixed(3)}`;
  const hit = lambdaCache.get(key);
  if (hit) return hit;
  let best = { home: 1.4, away: 1.1, err: Infinity };
  for (let lh = 0.2; lh <= 3.6; lh += 0.05) {
    for (let la = 0.2; la <= 3.6; la += 0.05) {
      let pH = 0;
      let pD = 0;
      for (let i = 0; i <= 8; i++) {
        const pi = poissonPmf(i, lh);
        for (let j = 0; j <= 8; j++) {
          const pij = pi * poissonPmf(j, la);
          if (i > j) pH += pij;
          else if (i === j) pD += pij;
        }
      }
      const pA = 1 - pH - pD;
      const err = (pH - o.home) ** 2 + (pD - o.draw) ** 2 + (pA - o.away) ** 2;
      if (err < best.err) best = { home: lh, away: la, err };
    }
  }
  const out = { home: best.home, away: best.away };
  lambdaCache.set(key, out);
  return out;
}

/** Buts moyens par équipe et par match, et taux de clean sheet moyen. */
const AVG_TEAM_GOALS = 1.35;
/** Effet d'un clean sheet probable sur la note d'un gardien/défenseur (heuristique). */
const CLEAN_SHEET_NOTE_EFFECT = 1.2;

// --- Suspension au prochain jaune -----------------------------------------------

/** Règle de suspension pour cumul de jaunes (approximation par championnat). */
const YELLOW_RULES: Record<string, { threshold: number; window: number }> = {
  "1": { threshold: 3, window: 10 },
  "4": { threshold: 3, window: 10 },
  "2": { threshold: 5, window: 19 },
  "3": { threshold: 5, window: 38 },
  "5": { threshold: 5, window: 38 },
};

// --- Projection d'un joueur -------------------------------------------------------

export type StartBand = "sure" | "likely" | "doubt" | "unlikely";

export function startBand(p: number): StartBand {
  if (p >= 0.9) return "sure";
  if (p >= 0.6) return "likely";
  if (p >= 0.4) return "doubt";
  return "unlikely";
}

export interface Reason {
  label: string;
  positive: boolean;
}

export interface PlayerProjection extends Projection {
  detailedPosition: string;
  quotation?: number;
  features: Features;
  explanation: NoteContribution[];
  status: PlayerStatus;
  statusLabel?: string;
  opponentName?: string;
  opponentRank?: number;
  teamRank?: number;
  isHome?: boolean;
  kickoff?: number;
  cleanSheetProb?: number;
  teamWinProb?: number;
  band: StartBand;
  /** Notes des 5 derniers matchs du club (0 = non noté), du plus récent au plus ancien. */
  lastNotes: number[];
  yellowRisk?: { cards: number; threshold: number };
  midweek?: { before: boolean; after: boolean; competition?: string };
  /** Sources qui ont modifié la projection (compos, cotes, statut…). */
  signals: string[];
  reasons: Reason[];
  /** Hypothèse modifiée par l'utilisateur. */
  overridden: boolean;
}

function toRawHistory(p: Player, seasonId: number): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of p.matches) {
    if (m.seasonId === seasonId) out.push({ round: m.round, note: m.note, minutes: m.minutes, goals: m.goals, started: m.started });
    else if (m.seasonId < seasonId) out.push({ round: -1, note: m.note, minutes: m.minutes, goals: m.goals, started: m.started });
  }
  return out;
}

function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}

export function projectPlayer(
  snapshot: ChampionshipSnapshot,
  ctx: RoundContext,
  player: Player,
  signals: Signals = {},
  opts: { coefficients?: ModelCoefficients; useStatus?: boolean; clubId?: number } = {}
): PlayerProjection {
  const coefs = opts.coefficients ?? COEFFICIENTS;
  // Le club peut différer du club actuel quand on rejoue une journée passée.
  const clubId = opts.clubId ?? player.clubId;
  const fixture = clubId != null ? ctx.fixtureByClub.get(clubId) : undefined;
  const isHome = fixture ? fixture.homeId === clubId : undefined;
  const opponentId = fixture ? (isHome ? fixture.awayId : fixture.homeId) : undefined;
  const opponentRank = opponentId != null ? ctx.rankByClub.get(opponentId) : undefined;
  const teamRank = clubId != null ? ctx.rankByClub.get(clubId) : undefined;

  const clubRounds = snapshot.fixtures
    .filter(
      (f) =>
        f.seasonId === ctx.seasonId &&
        f.round < ctx.round &&
        (f.homeId === clubId || f.awayId === clubId) &&
        f.homeScore != null &&
        snapshot.ratedEventIds.has(f.id)
    )
    .map((f) => f.round);

  const features = buildFeatures({
    position: player.position,
    history: toRawHistory(player, ctx.seasonId),
    asOfRound: ctx.round,
    clubRoundsPlayed: clubRounds,
    quotation: quotationAt(player, fixture?.kickoff ?? ctx.firstKickoff, ctx.seasonId === snapshot.currentSeasonId),
    context: { opponentRank, teamRank, totalTeams: ctx.totalTeams, isHome },
  });

  const base = predict(features, coefs);
  let { pStart, pPlay, noteMean, goalRate } = base;
  const usedSignals: string[] = [];

  // Remplaçant qui entre : P(noté | non titulaire), déduite du modèle.
  const subRate = base.pStart < 0.999 ? Math.max(0, Math.min(1, (base.pPlay - base.pStart) / (1 - base.pStart))) : 0.2;
  const recomputePlay = () => {
    pPlay = Math.min(1, pStart * 0.98 + (1 - pStart) * subRate);
  };

  // Pas de match cette journée (report, exempt) : il ne jouera pas.
  if (!fixture) {
    pStart = 0;
    pPlay = 0;
    usedSignals.push("pas de match");
  }

  // Compos probables / officielles.
  const lineup = signals.lineups?.get(player.id);
  if (lineup && fixture) {
    const w = lineup.confirmed ? 1 : lineup.weight;
    pStart = w * lineup.pStart + (1 - w) * pStart;
    recomputePlay();
    usedSignals.push(lineup.confirmed ? "compo officielle" : `compos probables (${lineup.sources.join(", ")})`);
  }

  // Statut publié pour ce match.
  let status: PlayerStatus = "ok";
  let statusLabel: string | undefined;
  if (opts.useStatus !== false) {
    const st = statusForEvents(player.incidents, ctx.eventIds);
    status = st.status;
    statusLabel = st.label;
    if (st.status !== "ok" && st.returnAt != null && fixture && st.returnAt < fixture.kickoff && st.status === "injured") {
      // Retour annoncé avant le match : simple doute.
      status = "doubtful";
    }
  }
  if (status === "injured" || status === "suspended" || status === "out") {
    pStart = 0;
    pPlay = 0;
    usedSignals.push("indisponible");
  } else if (status === "doubtful") {
    pStart *= 0.5;
    pPlay *= 0.6;
    usedSignals.push("incertain");
  }

  // Coupe d'Europe autour de la journée (heuristique, non apprise).
  const midweek = clubId != null ? signals.midweek?.get(clubId) : undefined;
  if (midweek && pStart > 0) {
    pStart *= midweek.before ? 0.88 : 0.93;
    recomputePlay();
    usedSignals.push("coupe d'Europe");
  }

  // Hypothèse de l'utilisateur : elle prime sur tout le reste.
  const override = signals.overrides?.get(player.id);
  if (override?.pStart != null) {
    pStart = Math.max(0, Math.min(1, override.pStart));
    recomputePlay();
    usedSignals.push("ton hypothèse");
  }

  // Cotes 1-N-2 : buts attendus de son équipe et clean sheet.
  let cleanSheetProb: number | undefined;
  let teamWinProb: number | undefined;
  if (fixture?.odds) {
    const l = lambdasFromOdds(fixture.odds);
    const teamGoals = isHome ? l.home : l.away;
    const oppGoals = isHome ? l.away : l.home;
    cleanSheetProb = Math.exp(-oppGoals);
    teamWinProb = isHome ? fixture.odds.home : fixture.odds.away;
    // Le contexte du match est déjà dans le modèle : on n'applique que l'écart
    // entre ce que disent les bookmakers et ce que le modèle supposait.
    const modelMult = Math.exp(
      coefs.goals.oppWeakness * (features.oppWeakness - 0.5) +
        coefs.goals.home * (features.home - 0.5) +
        coefs.goals.teamStrength * (features.teamStrength - 0.5)
    );
    goalRate = (goalRate / modelMult) * (teamGoals / AVG_TEAM_GOALS);
    if (player.position === "G" || player.position === "D") {
      const expectedCs = Math.exp(-AVG_TEAM_GOALS / Math.max(0.3, modelMult));
      noteMean += CLEAN_SHEET_NOTE_EFFECT * (cleanSheetProb - Math.min(0.6, expectedCs)) * 0.5;
    }
    usedSignals.push("cotes des bookmakers");
  }

  // Cote « buteur » : on la mélange au taux du modèle.
  const scorer = signals.scorerOdds?.get(player.id);
  if (scorer != null && pPlay > 0.05) {
    const lambdaOdds = -Math.log(Math.max(1e-6, 1 - scorer)) / Math.max(0.3, pPlay);
    goalRate = 0.6 * lambdaOdds + 0.4 * goalRate;
    usedSignals.push("cote buteur");
  }

  // Dernières notes du club (0 = absent ou non noté), pour la mini-courbe.
  const byRound = new Map(
    player.matches.filter((m) => m.seasonId === ctx.seasonId).map((m) => [m.round, m.note])
  );
  const lastNotes = [...clubRounds].sort((a, b) => b - a).slice(0, 5).map((r) => byRound.get(r) ?? 0);

  // Risque de suspension au prochain jaune.
  let yellowRisk: PlayerProjection["yellowRisk"];
  const rule = YELLOW_RULES[snapshot.championshipId];
  if (rule && fixture) {
    const fixturesById = new Map(snapshot.fixtures.map((f) => [f.id, f]));
    const cards = yellowCardsInLast(player, rule.window, fixture.kickoff, fixturesById);
    if (cards === rule.threshold - 1) yellowRisk = { cards, threshold: rule.threshold };
  }

  const opponentName = opponentId != null ? snapshot.clubs.get(opponentId)?.name : undefined;
  const projection: PlayerProjection = {
    id: player.id,
    name: player.name,
    club: clubId != null ? snapshot.clubs.get(clubId)?.name ?? player.club : player.club,
    position: player.position as Pos,
    detailedPosition: player.detailedPosition,
    quotation: player.quotation,
    pStart,
    pPlay,
    noteMean: Math.min(8.5, Math.max(3, noteMean)),
    noteSd: base.noteSd,
    goalRate: Math.max(0, goalRate),
    features,
    explanation: explainNote(features, coefs),
    status,
    statusLabel,
    opponentName,
    opponentRank,
    teamRank,
    isHome,
    kickoff: fixture?.kickoff,
    cleanSheetProb,
    teamWinProb,
    band: startBand(pStart),
    lastNotes,
    yellowRisk,
    midweek,
    signals: usedSignals,
    reasons: [],
    overridden: override?.pStart != null,
  };
  projection.reasons = buildReasons(projection, ctx.totalTeams);
  return projection;
}

/** Les 3-4 facteurs les plus parlants, chiffrés. */
export function buildReasons(p: PlayerProjection, totalTeams: number): Reason[] {
  const out: Array<Reason & { w: number }> = [];
  const N = totalTeams || 18;
  if (p.status !== "ok") {
    const what = { injured: "Blessé", suspended: "Suspendu", out: "Hors groupe", doubtful: "Incertain", ok: "" }[p.status];
    out.push({ label: p.statusLabel && p.statusLabel !== what ? `${what} (${p.statusLabel})` : what, positive: false, w: 10 });
  }
  const pct = Math.round(p.pStart * 100);
  if (p.status === "ok" || p.status === "doubtful") {
    out.push({ label: `Titulaire à ${pct} %`, positive: p.pStart >= 0.7, w: p.pStart >= 0.9 ? 4 : 7 });
  }
  if (p.opponentName && p.opponentRank != null) {
    const strong = p.opponentRank <= Math.ceil(N / 4);
    const weak = p.opponentRank > N - Math.ceil(N / 4);
    if (strong || weak) {
      out.push({
        label: `${strong ? "Gros adversaire" : "Adversaire à sa portée"} : ${p.opponentName} (${ordinal(p.opponentRank)})`,
        positive: weak,
        w: 5,
      });
    }
  }
  if (p.isHome != null) out.push({ label: p.isHome ? "À domicile" : "À l'extérieur", positive: p.isHome, w: 2 });
  if (p.cleanSheetProb != null && (p.position === "G" || p.position === "D")) {
    const cs = Math.round(p.cleanSheetProb * 100);
    out.push({ label: `Clean sheet ${cs} % selon les bookmakers`, positive: cs >= 35, w: 4.5 });
  }
  const played = p.lastNotes.filter((n) => n > 0);
  if (played.length >= 2) {
    const avg = played.reduce((a, b) => a + b, 0) / played.length;
    if (avg >= 6) out.push({ label: `En forme : ${avg.toFixed(1)} de moyenne sur ses derniers matchs`, positive: true, w: 3.5 });
    else if (avg <= 4.5) out.push({ label: `En méforme : ${avg.toFixed(1)} de moyenne récente`, positive: false, w: 3.5 });
  }
  if (p.goalRate >= 0.35) out.push({ label: `${Math.round((1 - Math.exp(-p.goalRate)) * 100)} % de chances de marquer s'il joue`, positive: true, w: 3 });
  if (p.midweek) {
    out.push({
      label: `${p.midweek.competition ?? "Coupe d'Europe"} ${p.midweek.before ? "juste avant" : "juste après"} : risque de turnover`,
      positive: false,
      w: 4,
    });
  }
  if (p.yellowRisk) {
    out.push({
      label: `${p.yellowRisk.cards} jaunes : un de plus et il est suspendu`,
      positive: false,
      w: 2.5,
    });
  }
  if (p.overridden) out.push({ label: "Ton hypothèse de titularisation est appliquée", positive: true, w: 9 });
  return out.sort((a, b) => b.w - a.w).slice(0, 4).map(({ label, positive }) => ({ label, positive }));
}

export function projectPlayers(
  snapshot: ChampionshipSnapshot,
  ctx: RoundContext,
  players: Player[],
  signals: Signals = {},
  opts: { coefficients?: ModelCoefficients; useStatus?: boolean } = {}
): PlayerProjection[] {
  return players.map((p) => projectPlayer(snapshot, ctx, p, signals, opts));
}
