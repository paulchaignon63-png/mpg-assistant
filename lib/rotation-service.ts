/**
 * Bug 2.2 : Détection des rotations (même poste, même équipe, faible co-titularisation).
 * Si deux joueurs ont un taux de co-titularisation < 30%, ne pas recommander les deux.
 */

import { getSofascoreLineupHistory } from "./sofascore-client";
import type { Position } from "./recommendation";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/** Exporter pour construire les clés côté recommendation (même normalisation que les paires) */
export function normalizeForRotation(s: string): string {
  return normalize(s);
}

export interface PoolPlayerForRotation {
  name?: string;
  firstName?: string;
  lastName?: string;
  clubName?: string;
  position?: string | { toString?: () => string };
}

function getPositionFromMpg(position?: string | { toString?: () => string }): Position | null {
  if (!position) return null;
  const p = String(typeof position === "object" ? position?.toString?.() ?? "" : position).toUpperCase();
  if (p === "G" || p === "GARDIEN" || p === "GK") return "G";
  if (p.startsWith("D") || p === "DEFENSEUR" || p === "DC" || p === "DG" || p === "DD") return "D";
  if (p.startsWith("M") || p === "MILIEU" || p === "MC" || p === "MG" || p === "MD") return "M";
  if (p.startsWith("A") || p === "ATTAQUANT" || p === "AC" || p === "AG" || p === "AD") return "A";
  return null;
}

/** Identifiant unique d'une paire (ordre alphabétique pour éviter doublons) */
function pairKey(key1: string, key2: string): string {
  return key1 <= key2 ? `${key1}::${key2}` : `${key2}::${key1}`;
}

/** Clé utilisée dans le Set rotationLowPairs (pour utilisation dans recommendation) */
export function getRotationPairKey(
  clubName: string,
  pos: string,
  playerKey1: string,
  playerKey2: string
): string {
  const c = normalize(clubName);
  const p = pos as Position;
  const k1 = normalize(playerKey1);
  const k2 = normalize(playerKey2);
  return `${c}_${p}_${pairKey(k1, k2)}`;
}

/**
 * Retourne les paires (clubNorm, position, playerKey1, playerKey2) dont le taux de
 * co-titularisation est < seuil. Ces paires ne doivent pas être toutes les deux au 11.
 */
export async function getCoTitularisationLowPairs(
  championshipId: number | string,
  poolPlayers: PoolPlayerForRotation[],
  options?: { coTitulThreshold?: number; maxRounds?: number }
): Promise<Set<string>> {
  const threshold = options?.coTitulThreshold ?? 0.3;
  const lineupHistory = await getSofascoreLineupHistory(championshipId, options?.maxRounds ?? 20);
  if (lineupHistory.length === 0) return new Set();

  const lowPairs = new Set<string>();

  const byClubAndPos = new Map<string, Map<Position, Array<{ key: string; name: string }>>>();
  for (const p of poolPlayers) {
    const name = p.name ?? [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
    if (!name || !p.clubName) continue;
    const pos = getPositionFromMpg(p.position);
    if (!pos) continue;
    const key = normalize(name);
    const clubNorm = normalize(p.clubName);
    let byPos = byClubAndPos.get(clubNorm);
    if (!byPos) {
      byPos = new Map();
      byClubAndPos.set(clubNorm, byPos);
    }
    let arr = byPos.get(pos);
    if (!arr) {
      arr = [];
      byPos.set(pos, arr);
    }
    if (!arr.some((x) => x.key === key)) arr.push({ key, name });
  }

  const teamMatches = new Map<string, Array<Set<string>>>();
  for (const rec of lineupHistory) {
    const homeNorm = normalize(rec.homeTeam);
    const awayNorm = normalize(rec.awayTeam);
    const homeSet = new Set(rec.homeStarters);
    const awaySet = new Set(rec.awayStarters);
    if (!teamMatches.has(homeNorm)) teamMatches.set(homeNorm, []);
    teamMatches.get(homeNorm)!.push(homeSet);
    if (!teamMatches.has(awayNorm)) teamMatches.set(awayNorm, []);
    teamMatches.get(awayNorm)!.push(awaySet);
  }

  function findMatchesForClub(clubNorm: string): Array<Set<string>> {
    const direct = teamMatches.get(clubNorm);
    if (direct?.length) return direct;
    for (const [teamNorm, matches] of teamMatches) {
      if (clubNorm.includes(teamNorm) || teamNorm.includes(clubNorm)) return matches;
    }
    return [];
  }

  for (const [clubNorm, byPos] of byClubAndPos) {
    const matches = findMatchesForClub(clubNorm);
    if (!matches.length) continue;
    for (const [pos, players] of byPos) {
      if (players.length < 2) continue;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const key1 = players[i].key;
          const key2 = players[j].key;
          let both = 0;
          let atLeastOne = 0;
          for (const starters of matches) {
            const s1 = starters.has(key1) || Array.from(starters).some((s) => s.includes(key1) || key1.includes(s));
            const s2 = starters.has(key2) || Array.from(starters).some((s) => s.includes(key2) || key2.includes(s));
            if (s1 && s2) both++;
            if (s1 || s2) atLeastOne++;
          }
          const rate = atLeastOne > 0 ? both / atLeastOne : 0;
          if (rate < threshold) {
            lowPairs.add(`${clubNorm}_${pos}_${pairKey(key1, key2)}`);
          }
        }
      }
    }
  }
  return lowPairs;
}

/** Vérifie si deux joueurs (même club, même poste) sont en rotation (faible co-titul) */
export function isRotationPair(
  clubNorm: string,
  pos: Position,
  playerKey1: string,
  playerKey2: string,
  lowPairs: Set<string>
): boolean {
  const key = `${clubNorm}_${pos}_${pairKey(playerKey1, playerKey2)}`;
  return lowPairs.has(key);
}
