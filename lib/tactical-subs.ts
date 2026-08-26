/**
 * Remplacements tactiques : des suggestions (jamais des obligations) de type
 * « fais entrer X à la place de Y ». On ne se base pas seulement sur la note :
 * une suggestion n'apparaît que si une vraie raison la justifie.
 *
 * Deux natures de suggestion (étiquetées, expliquées en une ligne) :
 *  - « sécurité »  : le titulaire risque de ne pas jouer (incertain, ou souvent
 *                    remplaçant dans son club) → le banc sert de filet.
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
}

export interface TacticalSub {
  kind: SubKind;
  reason: string;
  out: { id: string; name?: string; clubName?: string; position: "G" | "D" | "M" | "A"; score: number };
  in: { id: string; name?: string; clubName?: string; position: "G" | "D" | "M" | "A"; score: number };
}

/** Écart de note minimal (sur 10) pour proposer une alternative « pure note ». */
const ALT_MIN_DELTA = 0.6;
/** En dessous, un titulaire est jugé « rotation » dans son club (risque de ne pas jouer). */
const ROTATION_TITU_THRESHOLD = 0.55;
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

    // Sécurité : le titulaire risque de ne pas jouer.
    if (doubtful) {
      chosen = {
        kind: "securite",
        reason: `${surname(s.name)} est incertain pour ce match — ${surname(best.name)} assure le coup si besoin.`,
        out: pick(s),
        in: pick(best),
        priority: 100,
      };
    } else if (rotationRisk) {
      chosen = {
        kind: "securite",
        reason: `${surname(s.name)} n'est pas toujours titulaire dans son club — ${surname(best.name)} en couverture.`,
        out: pick(s),
        in: pick(best),
        priority: 55,
      };
    }

    // Alternative : un banc nettement meilleur pour ce match précis.
    // Prend le pas si l'écart est vraiment marqué, sinon complète.
    if (delta >= ALT_MIN_DELTA) {
      const altPriority = 40 + delta * 12;
      if (!chosen || altPriority > chosen.priority) {
        chosen = {
          kind: "alternative",
          reason: altReason(s, best, totalTeams),
          out: pick(s),
          in: pick(best),
          priority: altPriority,
        };
      }
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
