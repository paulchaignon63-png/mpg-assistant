/**
 * Variables du modèle pour un joueur, calculées « à une date » : uniquement à
 * partir des matchs joués AVANT la journée visée. La même fonction sert à la
 * reco du jour et au banc d'essai, qui rejoue les journées passées sans
 * connaître leur résultat.
 */

import type { Pos } from "./mpg-rules";

/** Un match de l'historique MPGStats d'un joueur. */
export interface RawMatch {
  /** Journée : positive = saison en cours, négative = saison précédente. */
  round: number;
  /** Note MPG (0 ou absente = non noté). */
  note: number;
  minutes: number;
  goals: number;
  /** Titulaire (et non entré en jeu). */
  started?: boolean;
}

export interface MatchContext {
  /** Rang (force) de l'adversaire, 1 = le plus fort. */
  opponentRank?: number;
  /** Rang de l'équipe du joueur. */
  teamRank?: number;
  totalTeams: number;
  isHome?: boolean;
}

export interface Features {
  position: Pos;
  /** Part des 5 dernières journées où il a été noté. */
  rated5: number;
  /** Part des 5 dernières journées où il a été titulaire. */
  started5: number;
  /** Titulaire lors de la dernière journée. */
  startedLast: number;
  /** Noté lors de la dernière journée. */
  ratedLast: number;
  /** Nombre de journées de la saison déjà jouées par son club (avant la journée visée). */
  seasonRounds: number;
  /** Note récente pondérée (demi-vie 4 matchs), ramenée vers la moyenne du poste. */
  recentNote: number;
  /** Moyenne de la saison, ramenée vers la moyenne du poste. */
  seasonNote: number;
  /** Moyenne de la saison précédente (ou moyenne du poste). */
  prevNote: number;
  /** Buts par match noté, ramenés vers la moyenne du poste. */
  goalsPerMatch: number;
  /** Minutes moyennes quand il joue (0-1). */
  minutesShare: number;
  /** Cote MPG / 50 (0,3 = cote moyenne, si inconnue). */
  quotation: number;
  /** Force de son équipe : 1 = meilleure, 0 = plus faible. */
  teamStrength: number;
  /** Faiblesse de l'adversaire : 1 = le plus faible, 0 = le plus fort. */
  oppWeakness: number;
  /** 1 domicile, 0 extérieur, 0,5 inconnu. */
  home: number;
}

/** Moyennes de référence par poste (notes MPG, buts par match noté). */
export const POSITION_PRIOR: Record<Pos, { note: number; goals: number }> = {
  G: { note: 5.3, goals: 0 },
  D: { note: 5.0, goals: 0.04 },
  M: { note: 5.1, goals: 0.09 },
  A: { note: 4.9, goals: 0.3 },
};

/** Poids (en matchs) de la moyenne du poste dans les moyennes « ramenées ». */
const SHRINK_NOTE = 3;
const SHRINK_GOALS = 6;

function shrink(sum: number, count: number, prior: number, k: number): number {
  return (sum + prior * k) / (count + k);
}

/**
 * Calcule les variables avant la journée `asOfRound` de la saison en cours.
 * `asOfRound` = numéro de la journée à prédire (les matchs de cette journée
 * et des suivantes sont ignorés). `clubRoundsPlayed` liste les journées déjà
 * disputées par le club (pour savoir s'il a manqué un match).
 */
export function buildFeatures(input: {
  position: Pos;
  history: RawMatch[];
  asOfRound: number;
  clubRoundsPlayed: number[];
  quotation?: number;
  context: MatchContext;
}): Features {
  const { position, history, asOfRound, context } = input;
  const prior = POSITION_PRIOR[position];

  const season = history.filter((m) => m.round > 0 && m.round < asOfRound);
  const previous = history.filter((m) => m.round < 0);
  const byRound = new Map(season.map((m) => [m.round, m]));

  const clubRounds = input.clubRoundsPlayed
    .filter((r) => r > 0 && r < asOfRound)
    .sort((a, b) => b - a);
  const last5 = clubRounds.slice(0, 5);
  const rated = last5.filter((r) => (byRound.get(r)?.note ?? 0) > 0).length;
  const isStart = (m: RawMatch | undefined) => (m ? m.started ?? m.minutes >= 60 : false);
  const started = last5.filter((r) => isStart(byRound.get(r))).length;
  const denom5 = last5.length || 1;
  const lastRound = clubRounds[0];

  const ratedSeason = season.filter((m) => m.note > 0).sort((a, b) => b.round - a.round);
  let wSum = 0;
  let wNote = 0;
  ratedSeason.forEach((m, i) => {
    const w = Math.pow(0.5, i / 4);
    wSum += w;
    wNote += w * m.note;
  });
  const recentNote = (wNote + prior.note * 1.5) / (wSum + 1.5);

  const seasonSum = ratedSeason.reduce((a, m) => a + m.note, 0);
  const seasonNote = shrink(seasonSum, ratedSeason.length, prior.note, SHRINK_NOTE);

  const ratedPrev = previous.filter((m) => m.note > 0);
  const prevNote = shrink(
    ratedPrev.reduce((a, m) => a + m.note, 0),
    ratedPrev.length,
    prior.note,
    SHRINK_NOTE
  );

  const allRated = [...ratedSeason, ...ratedPrev];
  const goalsPerMatch = shrink(
    allRated.reduce((a, m) => a + m.goals, 0),
    allRated.length,
    prior.goals,
    SHRINK_GOALS
  );

  const playedMinutes = ratedSeason.map((m) => m.minutes).filter((x) => x > 0);
  const minutesShare = playedMinutes.length
    ? Math.min(1, playedMinutes.reduce((a, b) => a + b, 0) / playedMinutes.length / 90)
    : 0.6;

  const N = Math.max(2, context.totalTeams);
  const teamStrength = context.teamRank != null ? (N - context.teamRank) / (N - 1) : 0.5;
  const oppWeakness = context.opponentRank != null ? (context.opponentRank - 1) / (N - 1) : 0.5;

  return {
    position,
    rated5: last5.length ? rated / denom5 : 0.5,
    started5: last5.length ? started / denom5 : 0.5,
    ratedLast: lastRound != null ? ((byRound.get(lastRound)?.note ?? 0) > 0 ? 1 : 0) : 0.5,
    startedLast: lastRound != null ? (isStart(byRound.get(lastRound)) ? 1 : 0) : 0.5,
    seasonRounds: clubRounds.length,
    recentNote,
    seasonNote,
    prevNote,
    goalsPerMatch,
    minutesShare,
    quotation: input.quotation != null ? Math.min(1.2, input.quotation / 50) : 0.3,
    teamStrength,
    oppWeakness,
    home: context.isHome == null ? 0.5 : context.isHome ? 1 : 0,
  };
}
