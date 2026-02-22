/**
 * Algorithme de recommandation - meilleur 11
 * Score = forme + disponibilité + difficulté adversaire
 */

import type { MpgPlayer } from "@/types/mpg";

export type Position = "G" | "D" | "M" | "A";

export interface EnrichedPlayer extends MpgPlayer {
  position: Position;
  isInjured?: boolean;
  injuryReason?: string;
  nextOpponent?: string;
  formScore?: number;
  recommendationScore: number;
}

export interface Formation {
  G: number;
  D: number;
  M: number;
  A: number;
}

const FORMATIONS: Record<number, Formation> = {
  343: { G: 1, D: 3, M: 4, A: 3 },
  352: { G: 1, D: 3, M: 5, A: 2 },
  433: { G: 1, D: 4, M: 3, A: 3 },
  442: { G: 1, D: 4, M: 4, A: 2 },
  451: { G: 1, D: 4, M: 5, A: 1 },
  532: { G: 1, D: 5, M: 3, A: 2 },
  541: { G: 1, D: 5, M: 4, A: 1 },
};

const POSITION_COEFF: Record<Position, number> = {
  G: 1.0,
  D: 1.025,
  M: 1.05,
  A: 1.2,
};

function getPositionFromMpg(position?: string): Position {
  if (!position) return "M";
  const p = position.toUpperCase();
  if (p === "G" || p === "GARDIEN") return "G";
  if (p === "D" || p === "DEFENSEUR") return "D";
  if (p === "M" || p === "MILIEU") return "M";
  if (p === "A" || p === "ATTAQUANT") return "A";
  return "M";
}

export interface PoolPlayer {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  position?: string | { toString?: () => string };
  quotation?: number;
  average?: number;
  matchs?: number;
  goals?: number;
  clubId?: string;
  clubName?: string;
}

function extractPlayersFromSquad(
  squad: Record<string, unknown> | undefined,
  poolPlayers: PoolPlayer[] = []
): EnrichedPlayer[] {
  if (!squad || typeof squad !== "object") return [];

  const poolById = new Map(poolPlayers.map((p) => [p.id, p]));
  const players: EnrichedPlayer[] = [];
  const posMap: Record<string, Position> = {
    goalkeeper: "G",
    goalkeepers: "G",
    defender: "D",
    defenders: "D",
    midfielder: "M",
    midfielders: "M",
    attacker: "A",
    attackers: "A",
  };

  // Structure 1: squad = { playerId: { pricePaid?, ... } } (MPG API)
  for (const [key, value] of Object.entries(squad)) {
    const poolPlayer = poolById.get(key);
    if (poolPlayer) {
      const posStr = typeof poolPlayer.position === "object" ? poolPlayer.position?.toString?.() : String(poolPlayer.position ?? "");
      const pos = getPositionFromMpg(posStr);
      const name = poolPlayer.name ?? [poolPlayer.lastName, poolPlayer.firstName].filter(Boolean).join(" ").trim();
      players.push({
        ...poolPlayer,
        name: name || poolPlayer.name,
        position: pos,
        recommendationScore: 0,
      });
      continue;
    }

    // Structure 2: squad = { position: [players] }
    const pos = posMap[key.toLowerCase?.() ?? key] ?? "M";
    const list = Array.isArray(value) ? value : [];
    for (const p of list) {
      const mp = p as MpgPlayer & { position?: string; id?: string };
      const fromPool = mp.id ? poolById.get(mp.id) : null;
      const merged = fromPool ? { ...fromPool, ...mp } : mp;
      const posStr = typeof merged.position === "object" ? (merged.position as { toString?: () => string })?.toString?.() : String(merged.position ?? "");
      const posFromPlayer = posStr ? getPositionFromMpg(posStr) : pos;
      players.push({
        ...merged,
        position: posFromPlayer,
        recommendationScore: 0,
      });
    }
  }
  return players;
}

/**
 * Calcule le score de recommandation pour un joueur
 * Basé sur: moyenne, régularité (matchs/journées), buts, blessure
 */
export function computePlayerScore(
  player: EnrichedPlayer,
  options: {
    championshipDays?: number;
    injuredPlayers?: Set<string>;
  } = {}
): number {
  const { championshipDays = 15, injuredPlayers } = options;
  if (injuredPlayers?.has(player.name ?? "")) return -999;
  if (player.isInjured) return -999;

  const avg = player.average ?? 5;
  const matchs = player.matchs ?? 0;
  const goals = player.goals ?? 0;
  const coeff = POSITION_COEFF[player.position];

  // Formule inspirée de mpg-coach-bot
  const base = (matchs / championshipDays) * avg * (1 + goals * coeff * 0.1);
  return Math.round(base * 100) / 100;
}

/**
 * Sélectionne le meilleur 11 selon la formation
 */
export function selectBest11(
  players: EnrichedPlayer[],
  formation: number = 343,
  injuredNames: string[] = []
): EnrichedPlayer[] {
  const form = FORMATIONS[formation] ?? FORMATIONS[343];
  const injured = new Set(injuredNames);
  const byPos = { G: [] as EnrichedPlayer[], D: [] as EnrichedPlayer[], M: [] as EnrichedPlayer[], A: [] as EnrichedPlayer[] };

  for (const p of players) {
    const score = computePlayerScore(p, { injuredPlayers: injured });
    (p as EnrichedPlayer).recommendationScore = score;
    if (score > -100 && p.position) {
      byPos[p.position].push(p as EnrichedPlayer);
    }
  }

  const selected: EnrichedPlayer[] = [];
  for (const pos of ["G", "D", "M", "A"] as const) {
    const needed = form[pos];
    const sorted = byPos[pos].sort((a, b) => b.recommendationScore - a.recommendationScore);
    selected.push(...sorted.slice(0, needed));
  }
  return selected;
}

/**
 * Extrait les joueurs du squad MPG et retourne le meilleur 11
 * poolPlayers: données complètes (nom, position, stats) depuis championship-players-pool
 */
export function getRecommendedTeam(
  squad: Record<string, unknown> | undefined,
  formation: number = 343,
  injuredNames: string[] = [],
  poolPlayers: PoolPlayer[] = []
): EnrichedPlayer[] {
  const players = extractPlayersFromSquad(squad, poolPlayers);
  return selectBest11(players, formation, injuredNames);
}
