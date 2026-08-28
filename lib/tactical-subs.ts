/**
 * Remplacements tactiques : des suggestions (jamais des obligations) de type
 * « fais entrer X à la place de Y ». On ne se base pas seulement sur la note :
 * une suggestion n'apparaît que si une vraie raison la justifie.
 *
 * Deux natures de suggestion (étiquetées, expliquées en une ligne) :
 *  - « sécurité »  : le titulaire risque de ne pas jouer, ou pas jusqu'au bout
 *                    (incertain, souvent remplaçant, coupe d'Europe accolée, ou
 *                    sorti avant l'heure de jeu) → le banc sert de filet.
 *                    Comme le remplacement MPG ne se déclenche QUE si le
 *                    titulaire ne joue pas, une sécurité ne coûte rien : on ne
 *                    lui impose ni note minimale ni écart maximal.
 *  - « filet »     : le remplaçant est lui-même un titulaire potentiel. On le
 *                    place en couverture d'un titulaire pour le cas où celui-ci
 *                    rate son match — un vrai plan B, même sans risque
 *                    identifié. C'est la logique « si X se troue, Y prend le
 *                    relais ».
 *  - « alternative »: pour ce match précis, un joueur du banc est un meilleur
 *                    choix (adversaire, domicile/extérieur, forme, note estimée).
 *                    Là on fait sortir un joueur qui allait jouer : le banc doit
 *                    donc être solide et l'écart de note est encadré.
 *
 * Max 5, souvent moins. Si rien ne se déclenche → aucune suggestion (le 11 est
 * considéré optimal). Un même titulaire et un même remplaçant n'apparaissent
 * qu'une fois.
 */

import { MIN_SUBSTITUTE_SCORE } from "./recommendation";

export type SubKind = "securite" | "filet" | "alternative";

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
  /** Nom de la compétition concernée (« Ligue des champions »), si connue. */
  midweekCompetition?: string;
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
/**
 * « Filet » : note minimale pour qu'un remplaçant soit considéré comme un vrai
 * plan B, et écart maximal au-delà duquel la couverture n'a plus de sens.
 */
const FILET_MIN_BENCH_SCORE = 6;
const FILET_MAX_GAP = 2;

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
 * Alimenté par la coupe d'Europe (lib/euro-fixtures) et, le cas échéant, par
 * les autres compétitions vues dans le calendrier MPGStats.
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
/**
 * Évalue UNE paire titulaire → remplaçant et renvoie la meilleure raison de la
 * proposer, ou null. La priorité sert à départager quand plusieurs paires se
 * disputent le même joueur.
 */
function evaluatePair(
  s: SubCandidate,
  b: SubCandidate,
  totalTeams: number
): { kind: SubKind; reason: string; priority: number } | null {
  const doubtful = s.isDoubtful === true;
  const pctTit = s.pctTitularisations ?? 1;
  const delta = b.score - s.score;

  /**
   * Une ALTERNATIVE fait sortir un joueur qui, lui, va jouer : c'est un vrai
   * arbitrage, donc le banc doit tenir la route et l'écart de note compte.
   *
   * Une SÉCURITÉ, non. Le remplacement ne se déclenche que si le titulaire
   * défaille : il n'y a rien à perdre à en poser un, même avec un remplaçant
   * moins bien noté — sans lui, le poste ne rapporte rien du tout.
   */
  const benchGoodEnough = b.score >= MIN_SUBSTITUTE_SCORE;

  let chosen: { kind: SubKind; reason: string; priority: number } | null = null;
  const consider = (kind: SubKind, reason: string, priority: number) => {
    if (!chosen || priority > chosen.priority) chosen = { kind, reason, priority };
  };

  // --- Sécurités : le titulaire risque de ne pas jouer, ou pas jusqu'au bout.
  if (doubtful) {
    consider(
      "securite",
      `${surname(s.name)} est incertain pour ce match — ${surname(b.name)} assure le coup si besoin.`,
      100
    );
  } else if (pctTit < ROTATION_TITU_THRESHOLD) {
    consider(
      "securite",
      `${surname(s.name)} n'est titulaire que ${Math.round(pctTit * 100)} % du temps dans son club — ${surname(b.name)} en couverture.`,
      55 + (ROTATION_TITU_THRESHOLD - pctTit) * 40
    );
  }

  const edge = congestionEdge(s, b);
  if (edge) {
    const comp = s.midweekCompetition ?? "un autre match";
    consider(
      "securite",
      edge === "before"
        ? `${s.clubName ?? "Son club"} joue ${comp} juste avant : ${surname(s.name)} peut être fatigué ou ménagé, pas ${surname(b.name)}.`
        : `${s.clubName ?? "Son club"} enchaîne sur ${comp} juste après : risque que ${surname(s.name)} soit ménagé, pas ${surname(b.name)}.`,
      edge === "before" ? 70 : 65
    );
  }

  if (isEarlySubRisk(s, b)) {
    const sm = Math.round(avgMinutes(s) ?? 0);
    consider(
      "securite",
      `${surname(s.name)} ne joue en moyenne que ${sm} min par match, ${surname(b.name)} va au bout.`,
      50 + (EARLY_SUB_MINUTES - sm) * 0.4
    );
  }

  // --- Filet : le remplaçant est assez bon pour couvrir un raté du titulaire.
  if (b.score >= FILET_MIN_BENCH_SCORE && delta >= -FILET_MAX_GAP) {
    consider(
      "filet",
      `${surname(b.name)} (${b.score.toFixed(1)}) est un titulaire potentiel : plan B si ${surname(s.name)} rate son match.`,
      20 + delta * 8
    );
  }

  // --- Alternatives : sortir un joueur qui va jouer. Le banc doit tenir.
  if (benchGoodEnough) {
    if (delta >= ALT_MIN_DELTA) {
      consider("alternative", altReason(s, b, totalTeams), 40 + delta * 12);
    } else if (delta >= -MATCH_PIEGE_MARGIN && isMatchPiege(s, b, totalTeams)) {
      consider("alternative", matchPiegeReason(s, b, totalTeams), 45);
    }
  }

  return chosen;
}

/**
 * Construit les remplacements tactiques suggérés à partir des titulaires et du banc.
 * `bench` = remplaçants recommandés (tous postes confondus).
 *
 * On évalue TOUTES les paires titulaire × remplaçant d'un même poste, puis on
 * attribue au plus offrant. N'examiner que le meilleur remplaçant de chaque
 * poste privait les autres titulaires de toute couverture dès qu'il était pris,
 * alors qu'un deuxième remplaçant tout à fait valable attendait sur le banc.
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

  const scored: Array<TacticalSub & { priority: number }> = [];
  for (const s of starters) {
    for (const b of benchByPos[s.position] ?? []) {
      const ev = evaluatePair(s, b, totalTeams);
      if (ev) {
        scored.push({ kind: ev.kind, reason: ev.reason, out: pick(s), in: pick(b), priority: ev.priority });
      }
    }
  }

  // Attribution gloutonne : un titulaire et un remplaçant ne servent qu'une
  // fois — un même remplaçant ne peut pas couvrir deux titulaires à la fois.
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
