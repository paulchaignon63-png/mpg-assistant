/**
 * « Pourquoi » d'une recommandation : les 2-3 facteurs qui ont le plus pesé
 * sur la note d'un joueur, en langage clair, avec une polarité (+ / −).
 *
 * On les reconstruit à partir des mêmes données qui nourrissent le score, pour
 * rendre la reco transparente et critiquable, sans toucher au moteur.
 */

export interface Reason {
  label: string;
  /** true = facteur favorable (vert), false = défavorable (rouge). */
  positive: boolean;
}

export interface ReasonInput {
  position: "G" | "D" | "M" | "A";
  nextOpponentRank?: number;
  nextOpponentName?: string;
  isHome?: boolean;
  teamRank?: number;
  pctTitularisations?: number;
  averageLast5?: number;
  momentum?: number;
  goals?: number;
  assists?: number;
  totalTeams: number;
}

function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}

/**
 * Renvoie les raisons, triées par importance, plafonnées à `max`.
 * L'indisponibilité (blessé/suspendu) est gérée séparément à l'affichage.
 */
export function buildReasons(p: ReasonInput, max = 3): Reason[] {
  const out: Array<Reason & { weight: number }> = [];
  const N = p.totalTeams || 18;

  // Adversaire (force via le rang Elo)
  if (p.nextOpponentRank != null) {
    const r = p.nextOpponentRank;
    if (r <= 4) {
      out.push({ label: `Gros adversaire (${ordinal(r)})`, positive: false, weight: 5 });
    } else if (r >= N - 3) {
      out.push({ label: `Adversaire faible (${ordinal(r)})`, positive: true, weight: 5 });
    }
  }

  // Domicile / extérieur
  if (p.isHome === true) out.push({ label: "À domicile", positive: true, weight: 2 });
  else if (p.isHome === false) out.push({ label: "En déplacement", positive: false, weight: 2 });

  // Force de sa propre équipe
  if (p.teamRank != null) {
    if (p.teamRank <= 4) out.push({ label: "Équipe solide", positive: true, weight: 4 });
    else if (p.teamRank >= N - 3) out.push({ label: "Équipe en difficulté", positive: false, weight: 4 });
  }

  // Titularisation
  if (p.pctTitularisations != null) {
    if (p.pctTitularisations >= 0.85)
      out.push({ label: "Titulaire indiscutable", positive: true, weight: 4.5 });
    else if (p.pctTitularisations < 0.6)
      out.push({ label: "Souvent remplaçant", positive: false, weight: 4.5 });
  }

  // Forme récente
  if (p.averageLast5 != null) {
    if (p.averageLast5 >= 6) out.push({ label: "En forme", positive: true, weight: 3.5 });
    else if (p.averageLast5 > 0 && p.averageLast5 <= 4.5)
      out.push({ label: "En méforme", positive: false, weight: 3.5 });
  }
  if (p.momentum != null && p.momentum >= 1)
    out.push({ label: "Sur une bonne série", positive: true, weight: 2.5 });

  // Rendement offensif
  if ((p.assists ?? 0) >= 5)
    out.push({ label: `Passeur (${p.assists})`, positive: true, weight: 3 });
  if ((p.goals ?? 0) >= 8)
    out.push({ label: `Buteur (${p.goals})`, positive: true, weight: 3 });

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map(({ label, positive }) => ({ label, positive }));
}
