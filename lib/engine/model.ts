/**
 * Modèle de prédiction : à partir des variables d'un joueur, il donne
 *  - P(noté) et P(titulaire) (régressions logistiques),
 *  - la note attendue s'il joue et son écart-type (régression linéaire par poste),
 *  - les buts attendus s'il joue (taux de Poisson ajusté au match).
 *
 * Les coefficients sont appris sur l'historique MPGStats par
 * `npm run train` (scripts/train-model.ts) et rangés dans
 * model/coefficients.json. Ceux livrés par défaut sont des valeurs de départ
 * raisonnables, remplacées au premier entraînement.
 */

import type { Pos } from "./mpg-rules";
import type { Features } from "./features";
import { POSITION_PRIOR } from "./features";
import trained from "./model/coefficients.json";

export const NOTE_TERMS = [
  "recentNote",
  "seasonNote",
  "prevNote",
  "quotation",
  "teamStrength",
  "oppWeakness",
  "home",
] as const;
export type NoteTerm = (typeof NOTE_TERMS)[number];

export const PLAY_TERMS = ["rated5", "started5", "ratedLast", "startedLast", "minutesShare", "quotation", "earlySeason"] as const;
export type PlayTerm = (typeof PLAY_TERMS)[number];

export interface NoteModel {
  intercept: number;
  coef: Record<NoteTerm, number>;
  /** Moyenne de chaque variable sur les données d'entraînement (pour l'explication). */
  means: Record<NoteTerm, number>;
  /** Écart-type des résidus : incertitude de la note. */
  sd: number;
}

export interface LogisticModel {
  intercept: number;
  coef: Record<PlayTerm, number>;
}

export interface ModelCoefficients {
  version: string;
  trainedAt: string | null;
  samples: number;
  play: LogisticModel;
  start: LogisticModel;
  note: Record<Pos, NoteModel>;
  goals: { oppWeakness: number; home: number; teamStrength: number };
}

export const COEFFICIENTS = trained as ModelCoefficients;

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function playTerms(f: Features): Record<PlayTerm, number> {
  return {
    rated5: f.rated5,
    started5: f.started5,
    ratedLast: f.ratedLast,
    startedLast: f.startedLast,
    minutesShare: f.minutesShare,
    quotation: f.quotation,
    // En tout début de saison, l'historique récent ne dit presque rien.
    earlySeason: f.seasonRounds < 3 ? 1 : 0,
  };
}

export function noteTerms(f: Features): Record<NoteTerm, number> {
  return {
    recentNote: f.recentNote,
    seasonNote: f.seasonNote,
    prevNote: f.prevNote,
    quotation: f.quotation,
    teamStrength: f.teamStrength,
    oppWeakness: f.oppWeakness,
    home: f.home,
  };
}

function logistic(m: LogisticModel, t: Record<PlayTerm, number>): number {
  let z = m.intercept;
  for (const k of PLAY_TERMS) z += (m.coef[k] ?? 0) * t[k];
  return sigmoid(z);
}

export interface BaseProjection {
  pPlay: number;
  pStart: number;
  noteMean: number;
  noteSd: number;
  goalRate: number;
}

export function predict(f: Features, coefs: ModelCoefficients = COEFFICIENTS): BaseProjection {
  const pt = playTerms(f);
  const pPlay = logistic(coefs.play, pt);
  // Être titulaire implique d'être noté : on borne P(titulaire) par P(noté).
  const pStart = Math.min(pPlay, logistic(coefs.start, pt));

  const nm = coefs.note[f.position];
  const nt = noteTerms(f);
  let noteMean = nm.intercept;
  for (const k of NOTE_TERMS) noteMean += (nm.coef[k] ?? 0) * nt[k];
  noteMean = Math.min(8.5, Math.max(3, noteMean));

  const g = coefs.goals;
  const goalRate =
    f.goalsPerMatch *
    Math.exp(
      g.oppWeakness * (f.oppWeakness - 0.5) + g.home * (f.home - 0.5) + g.teamStrength * (f.teamStrength - 0.5)
    );

  return { pPlay, pStart, noteMean, noteSd: nm.sd, goalRate };
}

export interface NoteContribution {
  term: NoteTerm | "base";
  label: string;
  value: number;
}

const TERM_LABELS: Record<NoteTerm, string> = {
  recentNote: "Forme récente",
  seasonNote: "Niveau sur la saison",
  prevNote: "Saison passée",
  quotation: "Cote MPG",
  teamStrength: "Force de son équipe",
  oppWeakness: "Adversaire",
  home: "Domicile / extérieur",
};

/**
 * Décomposition de la note attendue : base du poste (joueur moyen, match
 * moyen) + écart dû à chaque facteur. La somme redonne la note attendue
 * (avant bornage).
 */
export function explainNote(f: Features, coefs: ModelCoefficients = COEFFICIENTS): NoteContribution[] {
  const nm = coefs.note[f.position];
  const nt = noteTerms(f);
  let base = nm.intercept;
  for (const k of NOTE_TERMS) base += (nm.coef[k] ?? 0) * nm.means[k];
  const rows: NoteContribution[] = [{ term: "base", label: "Joueur moyen du poste", value: base }];
  for (const k of NOTE_TERMS) {
    const v = (nm.coef[k] ?? 0) * (nt[k] - nm.means[k]);
    if (Math.abs(v) >= 0.01) rows.push({ term: k, label: TERM_LABELS[k], value: v });
  }
  return rows;
}

/** Valeur par défaut des moyennes, utile aux tests et au premier entraînement. */
export function defaultMeans(pos: Pos): Record<NoteTerm, number> {
  const n = POSITION_PRIOR[pos].note;
  return {
    recentNote: n,
    seasonNote: n,
    prevNote: n,
    quotation: 0.3,
    teamStrength: 0.5,
    oppWeakness: 0.5,
    home: 0.5,
  };
}
