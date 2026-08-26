/**
 * Remplacements tactiques : des suggestions (jamais des obligations) de type
 * « fais entrer X à la place de Y ». On ne se base pas seulement sur la note :
 * une suggestion n'apparaît que si une vraie raison la justifie.
 *
 * Deux natures de suggestion (étiquetées, expliquées en une ligne) :
 *  - « sécurité »  : le titulaire risque de ne pas jouer, ou pas jusqu'au bout
 *                    (incertain, souvent remplaçant, ou sorti avant l'heure de
 *                    jeu) → le banc sert de filet.
 *  - « alternative »: pour ce match précis, un joueur du banc est un meilleur
 *                    choix (adversaire, domicile/extérieur, forme, note estimée).
 *
 * Max 5, souvent moins. Si rien ne se déclenche → aucune suggestion (le 11 est
 * considéré optimal). Un même titulaire et un même remplaçant n'apparaissent
 * qu'une fois.
 */

import { MIN_SUBSTITUTE_SCORE } from "./recommendation";

export type SubKind = "securite" | "alternative";

export interface SubCandidate {
  id?: string;
  name?: string;
  position: "G" | "D" | "M" | "A";
  clubName?: string;
  score: number;
  isDoubtful?: boolean;
  pctTitularisations?: number;
  nextOpponentRank?: number;
  isHome?: boolean;
  averageLast5?: number;
  momentum?: number;
  /** Minutes jouées lors des 5 derniers matchs (0 = pas entré). */
  last5Minutes?: number[];
  /** Le club dispute un autre match juste avant la journée. */
  midweekBefore?: boolean;
  /** Le club dispute un autre match juste après la journée. */
  midweekAfter?: boolean;
}

export interface TacticalSub {
  kind: SubKind;
  reason: string;
  out: { id: string; name?: string; clubName?: string; position: "G" | "D" | "M" | "A"; score: number };
  in: { id: string; name?: string; clubName?: string; position: "G" | "D" | "M" | "A"; score: number };
}

/** Écart de note minimal (sur 10) pour proposer une alternative « pure note ». */
const ALT_MIN_DELTA = 0.6;
/**
 * Écart de note maximal (remplaçant en dessous) toléré pour un « coup de poker »
 * match-piège : on accepte de proposer un joueur un peu moins bien noté si son
 * match est nettement plus favorable que celui du titulaire.
 */
const MATCH_PIEGE_MARGIN = 0.8;
/** En dessous, un titulaire est jugé « rotation » dans son club (risque de ne pas jouer). */
const ROTATION_TITU_THRESHOLD = 0.55;
/**
 * Temps de jeu : un joueur remplacé avant l'heure de jeu marque moins, cadre
 * moins et voit sa note figée plus tôt. En dessous de ce seuil (minutes
 * moyennes sur les matchs qu'il a joués), on considère qu'il sort tôt.
 */
const EARLY_SUB_MINUTES = 66;
/** Au-dessus, un joueur va au bout de ses matchs. */
const FULL_GAME_MINUTES = 80;
/** Écart de note maximal toléré pour proposer un joueur au temps de jeu supérieur. */
const MINUTES_MARGIN = 0.7;
/** Écart de note maximal toléré pour proposer un joueur dont le club n'enchaîne pas. */
const CONGESTION_MARGIN = 0.7;
/** Nombre maximum de suggestions affichées. */
const MAX_SUBS = 5;

function keyOf(p: { id?: string; name?: string }): string {
  return p.id ?? p.name ?? "";
}

function surname(name?: string): string {
  if (!name) return "le joueur";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

/** Raison en une ligne pour une alternative : on met en avant le facteur le plus parlant. */
function altReason(s: SubCandidate, b: SubCandidate, totalTeams: number): string {
  const N = totalTeams || 18;
  const so = surname(s.name);
  const bo = surname(b.name);

  if (s.nextOpponentRank != null && b.nextOpponentRank != null) {
    if (s.nextOpponentRank <= 4 && b.nextOpponentRank >= N - 4) {
      return `${so} affronte un gros adversaire, ${bo} une équipe plus faible.`;
    }
  }
  if (s.isHome === false && b.isHome === true) {
    return `${so} joue à l'extérieur, ${bo} à domicile.`;
  }
  if ((b.averageLast5 ?? 0) >= 6 && s.averageLast5 != null && s.averageLast5 > 0 && s.averageLast5 <= 4.5) {
    return `${bo} est en forme, ${so} en méforme.`;
  }
  if ((b.momentum ?? 0) >= 1 && (s.momentum ?? 0) < 0) {
    return `${bo} est sur une meilleure dynamique que ${so}.`;
  }
  return `Sur ce match, ${bo} a une meilleure note estimée que ${so}.`;
}

/** Décrit brièvement le match d'un joueur (« un gros adversaire à l'extérieur »). */
function describeFixture(p: SubCandidate, totalTeams: number): string {
  const N = totalTeams || 18;
  const bits: string[] = [];
  if (p.nextOpponentRank != null) {
    if (p.nextOpponentRank <= 5) bits.push("un gros adversaire");
    else if (p.nextOpponentRank >= N - 4) bits.push("une équipe faible");
  }
  if (p.isHome === true) bits.push("à domicile");
  else if (p.isHome === false) bits.push("à l'extérieur");
  return bits.join(" ");
}

/**
 * « Match piège » : le titulaire a un match difficile et le remplaçant un match
 * nettement plus favorable, même si sa note est légèrement en dessous. C'est le
 * coup de poker classique de MPG que la comparaison de notes brute masque
 * (la note intègre déjà l'adversaire, donc un bon joueur en match dur reste
 * souvent au-dessus d'un joueur correct en match facile).
 */
function isMatchPiege(s: SubCandidate, b: SubCandidate, totalTeams: number): boolean {
  const N = totalTeams || 18;
  const starterHard =
    (s.nextOpponentRank != null && s.nextOpponentRank <= 5) || s.isHome === false;
  const benchEasy =
    (b.nextOpponentRank != null && b.nextOpponentRank >= N - 4) || b.isHome === true;
  if (!starterHard || !benchEasy) return false;
  // Exige un vrai écart de difficulté d'adversaire (pas seulement dom./ext.).
  if (s.nextOpponentRank != null && b.nextOpponentRank != null) {
    return b.nextOpponentRank - s.nextOpponentRank >= 6;
  }
  // Sans rang d'adversaire des deux côtés : exige le combo extérieur → domicile.
  return s.isHome === false && b.isHome === true;
}

function matchPiegeReason(s: SubCandidate, b: SubCandidate, totalTeams: number): string {
  const so = surname(s.name);
  const bo = surname(b.name);
  const sFix = describeFixture(s, totalTeams);
  const bFix = describeFixture(b, totalTeams);
  const sDesc = sFix ? ` (${sFix})` : "";
  const bDesc = bFix ? ` (${bFix})` : "";
  return `Coup de poker : ${so} a un match difficile${sDesc}, ${bo} un match bien plus favorable${bDesc}.`;
}


/** Minutes moyennes sur les matchs réellement joués (ignore les matchs sans entrée). */
function avgMinutes(p: SubCandidate): number | undefined {
  const played = (p.last5Minutes ?? []).filter((m) => m > 0);
  if (played.length === 0) return undefined;
  return played.reduce((a, b) => a + b, 0) / played.length;
}

/**
 * « Sort tôt » : le titulaire est systématiquement remplacé avant l'heure de jeu
 * alors que le remplaçant va au bout. À MPG, un joueur sorti à la 60e a moins
 * d'occasions de marquer/passer et sa note est figée plus tôt — un signal que la
 * note seule ne capture pas.
 */
function isEarlySubRisk(s: SubCandidate, b: SubCandidate): boolean {
  const sm = avgMinutes(s);
  const bm = avgMinutes(b);
  if (sm == null || bm == null) return false;
  return sm < EARLY_SUB_MINUTES && bm >= FULL_GAME_MINUTES;
}

/**
 * « Turnover » : le club du titulaire enchaîne un autre match autour de la
 * journée, pas celui du remplaçant. Avant, le joueur arrive fatigué ; après,
 * l'entraîneur ménage souvent ses cadres.
 *
 * Inerte tant que la source ne fournit pas les coupes (cf. mpgstats-client).
 */
function congestionEdge(s: SubCandidate, b: SubCandidate): "before" | "after" | null {
  const benchFree = !b.midweekBefore && !b.midweekAfter;
  if (!benchFree) return null;
  if (s.midweekBefore) return "before";
  if (s.midweekAfter) return "after";
  return null;
}

/**
 * Construit les remplacements tactiques suggérés à partir des titulaires et du banc.
 * `bench` = remplaçants recommandés (tous postes confondus).
 */
export function buildTacticalSubs(
  starters: SubCandidate[],
  bench: SubCandidate[],
  totalTeams: number
): TacticalSub[] {
  const benchByPos: Record<string, SubCandidate[]> = { G: [], D: [], M: [], A: [] };
  for (const b of bench) {
    if (b.score > 0) benchByPos[b.position]?.push(b);
  }
  for (const pos of Object.keys(benchByPos)) {
    benchByPos[pos].sort((a, b) => b.score - a.score);
  }

  const scored: Array<TacticalSub & { priority: number }> = [];

  for (const s of starters) {
    const options = benchByPos[s.position] ?? [];
    if (options.length === 0) continue;
    const best = options[0];
    if (best.score < MIN_SUBSTITUTE_SCORE) continue; // banc trop faible → pas de suggestion

    const doubtful = s.isDoubtful === true;
    const rotationRisk = (s.pctTitularisations ?? 1) < ROTATION_TITU_THRESHOLD;
    const delta = best.score - s.score;

    let chosen: (TacticalSub & { priority: number }) | null = null;
    const consider = (kind: SubKind, reason: string, priority: number) => {
      if (!chosen || priority > chosen.priority) {
        chosen = { kind, reason, out: pick(s), in: pick(best), priority };
      }
    };

    // Sécurité : le titulaire risque de ne pas jouer (ou pas jusqu'au bout).
    if (doubtful) {
      consider(
        "securite",
        `${surname(s.name)} est incertain pour ce match — ${surname(best.name)} assure le coup si besoin.`,
        100
      );
    } else if (rotationRisk) {
      consider(
        "securite",
        `${surname(s.name)} n'est pas toujours titulaire dans son club — ${surname(best.name)} en couverture.`,
        55
      );
    }

    // Sécurité « temps de jeu » : sort avant l'heure de jeu alors que l'autre va au bout.
    if (delta >= -MINUTES_MARGIN && isEarlySubRisk(s, best)) {
      const sm = Math.round(avgMinutes(s) ?? 0);
      consider(
        "securite",
        `${surname(s.name)} est souvent remplacé en cours de match (${sm} min en moyenne), ${surname(best.name)} va au bout.`,
        50
      );
    }

    // Sécurité « enchaînement » : le club du titulaire a un autre match accolé.
    if (delta >= -CONGESTION_MARGIN) {
      const edge = congestionEdge(s, best);
      if (edge === "before") {
        consider(
          "securite",
          `${s.clubName ?? "Son club"} enchaîne un match juste avant : ${surname(s.name)} peut être ménagé ou fatigué, pas ${surname(best.name)}.`,
          70
        );
      } else if (edge === "after") {
        consider(
          "securite",
          `${s.clubName ?? "Son club"} enchaîne un match juste après : risque que ${surname(s.name)} soit ménagé, pas ${surname(best.name)}.`,
          65
        );
      }
    }

    // Alternative « pure note » : un banc nettement meilleur pour ce match précis.
    if (delta >= ALT_MIN_DELTA) {
      consider("alternative", altReason(s, best, totalTeams), 40 + delta * 12);
    } else if (delta >= -MATCH_PIEGE_MARGIN && isMatchPiege(s, best, totalTeams)) {
      // Alternative « match piège » : le remplaçant est un peu en dessous mais
      // a un match bien plus favorable → coup de poker à considérer.
      consider("alternative", matchPiegeReason(s, best, totalTeams), 45);
    }

    if (chosen) scored.push(chosen);
  }

  // Tri par priorité, puis affectation gloutonne : un titulaire et un remplaçant
  // ne peuvent apparaître qu'une seule fois.
  scored.sort((a, b) => b.priority - a.priority);
  const usedOut = new Set<string>();
  const usedIn = new Set<string>();
  const out: TacticalSub[] = [];
  for (const c of scored) {
    if (out.length >= MAX_SUBS) break;
    const ok = keyOf(c.out);
    const ik = keyOf(c.in);
    if (usedOut.has(ok) || usedIn.has(ik)) continue;
    usedOut.add(ok);
    usedIn.add(ik);
    out.push({ kind: c.kind, reason: c.reason, out: c.out, in: c.in });
  }
  return out;
}

function pick(p: SubCandidate) {
  return {
    id: keyOf(p),
    name: p.name,
    clubName: p.clubName,
    position: p.position,
    score: p.score,
  };
}
