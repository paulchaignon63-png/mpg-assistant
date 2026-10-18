/**
 * Règles MPG utilisées par la simulation.
 *
 * Tout ce qui décrit le jeu (pas nos estimations) est regroupé ici pour pouvoir
 * être corrigé en un seul endroit si MPG change ses règles. Les valeurs non
 * vérifiées sur la documentation officielle sont signalées « à vérifier ».
 */

export type Pos = "G" | "D" | "M" | "A";

export const POSITIONS: readonly Pos[] = ["G", "D", "M", "A"];

/** Lignes dans l'ordre du terrain, pour mesurer la distance d'un remplacement. */
export const LINE_INDEX: Record<Pos, number> = { G: 0, D: 1, M: 2, A: 3 };

export interface Formation {
  G: number;
  D: number;
  M: number;
  A: number;
}

export const FORMATIONS: Record<number, Formation> = {
  343: { G: 1, D: 3, M: 4, A: 3 },
  352: { G: 1, D: 3, M: 5, A: 2 },
  424: { G: 1, D: 4, M: 2, A: 4 },
  433: { G: 1, D: 4, M: 3, A: 3 },
  442: { G: 1, D: 4, M: 4, A: 2 },
  451: { G: 1, D: 4, M: 5, A: 1 },
  532: { G: 1, D: 5, M: 3, A: 2 },
  541: { G: 1, D: 5, M: 4, A: 1 },
};

export const AVAILABLE_FORMATIONS = [343, 352, 424, 433, 442, 451, 532, 541] as const;

export function formatFormation(code: number): string {
  const s = String(code);
  return s.length === 3 ? `${s[0]}-${s[1]}-${s[2]}` : s;
}

/** Taille du banc MPG : 1 gardien + 6 joueurs de champ. */
export const BENCH_SIZE = { G: 1, outfield: 6 } as const;

/**
 * Remplaçant fictif quand personne ne peut entrer (« Rotaldo »).
 * Source : guides MPG publics (abargenteuil.fr), 2025.
 */
export const ROTALDO_NOTE = 2.5;

/**
 * Pénalité par ligne d'écart quand un remplaçant d'une autre ligne entre
 * (un milieu qui remplace un attaquant : −1). Le gardien n'est remplacé que
 * par un gardien.
 */
export const LINE_SKIP_PENALTY = 1;

/** Bornes des notes MPG. */
export const NOTE_MIN = 1;
export const NOTE_MAX = 10;

/**
 * Bonus « Cheat Code 18-26 » (saison 2025-26) : −0,5 sur chaque joueur de
 * champ adverse, remplaçants entrés compris.
 */
export const CHEAT_CODE_MALUS = 0.5;

/**
 * But MPG (but « virtuel ») — APPROXIMATION à vérifier.
 * Un attaquant ou milieu titulaire qui n'a pas marqué de vrai but peut marquer
 * un but MPG si sa note dépasse, ligne après ligne, la moyenne des milieux
 * adverses, puis celle des défenseurs (moins ce décalage), puis la note du
 * gardien. Seuil de note minimal pour tenter sa chance.
 */
export const MPG_GOAL = {
  minNote: 5,
  defenseOffset: 0,
  eligible: ["A", "M"] as Pos[],
};

/** Valeur d'un vrai but pour classer les joueurs (en points de note). */
export const GOAL_VALUE = 1;
