/**
 * Apprentissage des coefficients du modèle à partir d'échantillons passés.
 */

import { logistic, poissonWithOffset, ridge } from "./fit";
import {
  NOTE_TERMS,
  PLAY_TERMS,
  noteTerms,
  playTerms,
  type ModelCoefficients,
  type NoteModel,
} from "./model";
import type { Sample } from "./dataset";
import { POSITIONS, type Pos } from "./mpg-rules";

export function trainCoefficients(samples: Sample[], previous: ModelCoefficients): ModelCoefficients {
  // --- P(noté) et P(titulaire), sur tous les joueurs dont le club joue.
  const Xp = samples.map((s) => PLAY_TERMS.map((k) => playTerms(s.projection.features)[k]));
  const yPlay = samples.map((s) => (s.actual.rated ? 1 : 0));
  const yStart = samples.map((s) => (s.actual.started ? 1 : 0));
  const wPlay = logistic(Xp, yPlay, 2);
  const wStart = logistic(Xp, yStart, 2);
  const toLogit = (w: number[]) => ({
    intercept: w[0],
    coef: Object.fromEntries(PLAY_TERMS.map((k, i) => [k, w[i + 1]])) as ModelCoefficients["play"]["coef"],
  });

  // --- Note si noté, par poste.
  const note = {} as Record<Pos, NoteModel>;
  for (const pos of POSITIONS) {
    const rows = samples.filter((s) => s.actual.rated && s.player.position === pos);
    if (rows.length < 200) {
      note[pos] = previous.note[pos];
      continue;
    }
    const X = rows.map((s) => NOTE_TERMS.map((k) => noteTerms(s.projection.features)[k]));
    const y = rows.map((s) => s.actual.note);
    const w = ridge(X, y, 5);
    const coef = Object.fromEntries(NOTE_TERMS.map((k, i) => [k, w[i + 1]])) as NoteModel["coef"];
    const means = Object.fromEntries(
      NOTE_TERMS.map((k, i) => [k, X.reduce((a, r) => a + r[i], 0) / X.length])
    ) as NoteModel["means"];
    let sse = 0;
    for (let i = 0; i < X.length; i++) {
      let pred = w[0];
      for (let j = 0; j < NOTE_TERMS.length; j++) pred += w[j + 1] * X[i][j];
      sse += (y[i] - pred) ** 2;
    }
    note[pos] = { intercept: w[0], coef, means, sd: Math.sqrt(sse / X.length) };
  }

  // --- Buts si noté : effet du match autour du taux propre au joueur.
  const g = samples.filter((s) => s.actual.rated && s.projection.features.goalsPerMatch > 0.005);
  const Xg = g.map((s) => [
    s.projection.features.oppWeakness - 0.5,
    s.projection.features.home - 0.5,
    s.projection.features.teamStrength - 0.5,
  ]);
  const wg = g.length > 500
    ? poissonWithOffset(Xg, g.map((s) => s.actual.goals), g.map((s) => s.projection.features.goalsPerMatch), 5)
    : [previous.goals.oppWeakness, previous.goals.home, previous.goals.teamStrength];

  const round = (x: number) => Math.round(x * 10000) / 10000;
  const roundObj = <T extends Record<string, number>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)])) as T;

  return {
    version: `appris-${new Date().toISOString().slice(0, 10)}`,
    trainedAt: new Date().toISOString(),
    samples: samples.length,
    play: { ...toLogit(wPlay), intercept: round(wPlay[0]), coef: roundObj(toLogit(wPlay).coef) },
    start: { ...toLogit(wStart), intercept: round(wStart[0]), coef: roundObj(toLogit(wStart).coef) },
    note: Object.fromEntries(
      POSITIONS.map((p) => [
        p,
        { intercept: round(note[p].intercept), coef: roundObj(note[p].coef), means: roundObj(note[p].means), sd: round(note[p].sd) },
      ])
    ) as Record<Pos, NoteModel>,
    goals: { oppWeakness: round(wg[0]), home: round(wg[1]), teamStrength: round(wg[2]) },
  };
}
