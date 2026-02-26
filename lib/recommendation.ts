/**
 * Algorithme de recommandation - meilleur 11
 * Score = forme + disponibilité + difficulté adversaire
 */

import type { MpgPlayer } from "@/types/mpg";
import {
  isPlayerInInjuryList,
  isPlayerInjuryMatchWithContext,
  type InjuryItemWithContext,
} from "./injuries-service";
import { getOpponentRankForClubAndRound } from "./match-opponent-rank-service";
import { getTeamFormMultiplier } from "./team-form-service";

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
  424: { G: 1, D: 4, M: 2, A: 4 },
  433: { G: 1, D: 4, M: 3, A: 3 },
  442: { G: 1, D: 4, M: 4, A: 2 },
  451: { G: 1, D: 4, M: 5, A: 1 },
  532: { G: 1, D: 5, M: 3, A: 2 },
  541: { G: 1, D: 5, M: 4, A: 1 },
};

/** Formations disponibles pour le dropdown (ordre d'affichage) */
export const AVAILABLE_FORMATIONS = [
  343, 352, 424, 433, 442, 451, 532, 541,
] as const;

/** Seuil minimum de score pour préférer un remplaçant (sinon affiché avec warning) */
export const MIN_SUBSTITUTE_SCORE = 4;

/** Nombre minimum de matchs pour être éligible titulaire sans pénalité (évite les joueurs avec 1-2 matchs) */
const MIN_MATCHES_FOR_STARTER = 5;

/** Répartition objectif du banc par formation : 1 G + 6 champ (D+M+A) */
const BENCH_TEMPLATES: Record<number, { G: 1; D: number; M: number; A: number }> = {
  343: { G: 1, D: 1, M: 2, A: 3 },
  352: { G: 1, D: 1, M: 3, A: 2 },
  424: { G: 1, D: 1, M: 2, A: 3 },
  433: { G: 1, D: 1, M: 2, A: 3 },
  442: { G: 1, D: 1, M: 2, A: 3 },
  451: { G: 1, D: 1, M: 3, A: 2 },
  532: { G: 1, D: 2, M: 2, A: 1 },
  541: { G: 1, D: 2, M: 2, A: 1 },
};

export type LowScoreReason = "peu_temps_jeu" | "souvent_remplacant" | "forme_limitee";

export const LOW_SCORE_LABELS: Record<LowScoreReason, string> = {
  peu_temps_jeu: "Peu de temps de jeu",
  souvent_remplacant: "Souvent remplaçant",
  forme_limitee: "Forme limitée",
};

export function getLowScoreReason(player: EnrichedPlayer & { matchs?: number; pctTitularisations?: number }): LowScoreReason {
  if ((player.matchs ?? 0) < 5) return "peu_temps_jeu";
  if (((player as PoolPlayer).pctTitularisations ?? 1) < 0.5) return "souvent_remplacant";
  return "forme_limitee";
}

export interface SubstitutePlayer extends EnrichedPlayer {
  lowScoreReason?: LowScoreReason;
}

export function formatFormation(code: number): string {
  const str = String(code);
  if (str.length !== 3) return str;
  return `${str[0]}-${str[1]}-${str[2]}`;
}

const POSITION_COEFF: Record<Position, number> = {
  G: 1.0,
  D: 1.025,
  M: 1.05,
  A: 1.2,
};

/** Coefficients pour la performance offensive (buts + passes) */
const OFFENSIVE_COEFF: Record<Position, number> = {
  G: 0.7,
  D: 0.85,
  M: 0.95,
  A: 1.3,
};

/** Seuils pour le mode "star de retour" (données insuffisantes) */
const INSUFFICIENT_DATA_THRESHOLDS = {
  minMatchs: 6,
  starQuotation: 30,
  attackerBonusQuotation: 35,
  pctTitularisationsThreshold: 0.8,
  pctTitMinQuotation: 15,
  doubtfulMultStar: 0.7,
};

function hasInsufficientData(player: PoolPlayer): boolean {
  const matchs = player.matchs ?? 0;
  const quotation = player.quotation ?? 0;
  const pctTit = player.pctTitularisations ?? 0;

  if (matchs < INSUFFICIENT_DATA_THRESHOLDS.minMatchs && quotation >= INSUFFICIENT_DATA_THRESHOLDS.starQuotation)
    return true;
  if (player.averageLast5 == null && quotation >= INSUFFICIENT_DATA_THRESHOLDS.starQuotation) return true;
  if (
    pctTit > INSUFFICIENT_DATA_THRESHOLDS.pctTitularisationsThreshold &&
    matchs < INSUFFICIENT_DATA_THRESHOLDS.minMatchs &&
    quotation >= INSUFFICIENT_DATA_THRESHOLDS.pctTitMinQuotation
  )
    return true;

  return false;
}

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPositionFromMpg(position?: string): Position {
  if (!position) return "M";
  const p = String(position).toUpperCase();
  if (p === "G" || p === "GARDIEN" || p === "GK") return "G";
  if (p.startsWith("D") || p === "DEFENSEUR" || p === "DC" || p === "DG" || p === "DD" || p === "DL" || p === "DR") return "D";
  if (p.startsWith("M") || p === "MILIEU" || p === "MC" || p === "MG" || p === "MD" || p === "ML" || p === "MR") return "M";
  if (p.startsWith("A") || p === "ATTAQUANT" || p === "AC" || p === "AG" || p === "AD" || p === "AL" || p === "AR") return "A";
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
  assists?: number;
  averageLast5?: number;
  momentum?: number;
  clubId?: string;
  clubName?: string;
  nextOpponentRank?: number;
  pctTitularisations?: number;
  yellowCards?: number;
  redCards?: number;
  isSuspended?: boolean;
  /** Notes des 5 derniers matchs (MPGStats) */
  last5Notes?: number[];
  /** Minutes jouées par match (5 derniers) */
  last5Minutes?: number[];
  /** Numéro de journée par match (5 derniers) */
  last5OpponentRounds?: number[];
  /** Matchs joués sur les 15 derniers jours (proxy = matches avec minutes > 0) */
  matchsLast15Days?: number;
  xG?: number;
  tackles?: number;
  interceptions?: number;
  cleanSheets?: number;
  accuratePassPct?: number;
  isHome?: boolean;
  teamFormWinsLast5?: number;
  opponentGoalsFor?: number;
  opponentGoalsAgainst?: number;
  injuryReturnDate?: string;
  suspensionReturnDate?: string;
  transferredRecently?: boolean;
  marketValue?: string;
}

function extractPlayersFromSquad(
  squad: Record<string, unknown> | undefined,
  poolPlayers: PoolPlayer[] = []
): EnrichedPlayer[] {
  if (!squad || typeof squad !== "object") return [];

  const poolById = new Map(poolPlayers.map((p) => [p.id, p]));
  const players: EnrichedPlayer[] = [];
  const posMap: Record<string, Position> = {
    g: "G",
    G: "G",
    goalkeeper: "G",
    goalkeepers: "G",
    gardien: "G",
    d: "D",
    D: "D",
    defender: "D",
    defenders: "D",
    defenseurs: "D",
    m: "M",
    M: "M",
    midfielder: "M",
    midfielders: "M",
    milieux: "M",
    a: "A",
    A: "A",
    attacker: "A",
    attackers: "A",
    attaquants: "A",
  };

  // Index pool par id, et variantes (mpg_player_123, mpg_championship_player_123, 123)
  const poolByNormalizedId = new Map<string, PoolPlayer>();
  for (const p of poolPlayers) {
    if (p.id) {
      poolByNormalizedId.set(p.id, p);
      const bare1 = p.id.replace(/^mpg_player_/i, "");
      const bare2 = p.id.replace(/^mpg_championship_player_/i, "");
      if (bare1 !== p.id) poolByNormalizedId.set(bare1, p);
      if (bare2 !== p.id) poolByNormalizedId.set(bare2, p);
    }
  }

  function getFromPool(id: string): PoolPlayer | undefined {
    return (
      poolById.get(id) ??
      poolByNormalizedId.get(id) ??
      poolByNormalizedId.get(id.replace(/^mpg_player_/i, "")) ??
      poolByNormalizedId.get(id.replace(/^mpg_championship_player_/i, ""))
    );
  }

  // Structure 1: squad = { playerId: { pricePaid?, id?, ... } } (MPG API)
  for (const [key, value] of Object.entries(squad)) {
    const poolPlayer = getFromPool(key);
    const valueObj = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    const altId = valueObj && typeof valueObj.id === "string" ? valueObj.id : key;
    const poolPlayer2 = !poolPlayer && altId !== key ? getFromPool(altId) : poolPlayer;
    const resolved = poolPlayer ?? poolPlayer2;

    if (resolved) {
      const posStr = typeof resolved.position === "object" ? resolved.position?.toString?.() : String(resolved.position ?? "");
      const pos = getPositionFromMpg(posStr);
      const name = resolved.name ?? [resolved.lastName, resolved.firstName].filter(Boolean).join(" ").trim();
      players.push({
        ...resolved,
        ...(valueObj || {}),
        name: name || resolved.name,
        position: pos,
        recommendationScore: 0,
      });
      continue;
    }

    // Structure 1b: value is full player object (id, position, etc.) - use it even without pool
    if (valueObj && (valueObj.id || valueObj.position || valueObj.name || valueObj.lastName)) {
      const posStr = String(valueObj.position ?? "");
      const pos = getPositionFromMpg(posStr);
      const nameRaw = valueObj.name ?? [valueObj.lastName, valueObj.firstName].filter(Boolean).join(" ").trim();
      const name = String(nameRaw || "");
      const merged = getFromPool(String(valueObj.id ?? key)) ?? (valueObj as PoolPlayer);
      players.push({
        ...merged,
        ...valueObj,
        name: name || (merged as PoolPlayer).name,
        position: pos,
        recommendationScore: 0,
      });
      continue;
    }

    // Structure 1c: key = playerId (mpg_player_xxx, etc.), value minimal — pool vide ou ID non trouvé
    // Ne pas perdre de joueurs quand le pool du championnat n'est pas chargé (ancienne ligue, etc.)
    const looksLikePlayerId =
      /^mpg_(player|championship_player)_/i.test(String(key)) || /^\d+$/.test(String(key));
    if (valueObj && !Array.isArray(value) && looksLikePlayerId) {
      const posStr = String(valueObj.position ?? "");
      const pos = getPositionFromMpg(posStr || "M");
      const nameRaw = valueObj.name ?? [valueObj.lastName, valueObj.firstName].filter(Boolean).join(" ").trim();
      const name = String(nameRaw || "").trim();
      players.push({
        ...(valueObj as PoolPlayer),
        id: String(valueObj.id ?? key),
        name: name || undefined,
        position: pos,
        recommendationScore: 0,
      });
      continue;
    }

    // Structure 2: squad = { position: [players ou IDs] }
    const pos = posMap[(key as string).toLowerCase?.() ?? key] ?? "M";
    const list = Array.isArray(value) ? value : [];
    for (const p of list) {
      const playerId = typeof p === "string" ? p : (p as { id?: string })?.id;
      const mp = typeof p === "object" && p !== null ? (p as MpgPlayer & { position?: string; id?: string }) : null;
      const fromPool = playerId ? getFromPool(playerId) : null;
      const merged = fromPool ? { ...fromPool, ...mp } : mp;
      if (!merged) continue;
      const posStr = typeof merged.position === "object" ? (merged.position as { toString?: () => string })?.toString?.() : String(merged.position ?? "");
      const posFromPlayer = posStr ? getPositionFromMpg(posStr) : pos;
      const m = merged as { name?: string; firstName?: string; lastName?: string };
      const name = m.name ?? [m.lastName, m.firstName].filter(Boolean).join(" ").trim();
      players.push({
        ...merged,
        name: name || merged.name,
        position: posFromPlayer,
        recommendationScore: 0,
      });
    }
  }

  // Dédupliquer par id (même joueur extrait via structure 1 et 2)
  const seen = new Set<string>();
  return players.filter((p) => {
    const id = (p.id ?? "").toString().trim();
    const key = id || `${p.position ?? "M"}_${(p.name ?? "").toString().trim()}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type InjuryStatus = "out" | "doubtful" | "ok";

/** Coefficient adversaire pour pondérer les notes (rang 1-3: ×1.2, 4-10: ×1.0, 11-15: ×0.95, 16+: ×0.8) */
function getOpponentCoeff(rank: number, totalTeams: number): number {
  if (rank <= 3) return 1.2;
  if (rank <= 10) return 1.0;
  if (rank <= 15 || totalTeams <= 15) return 0.95;
  return 0.8;
}

/** disponibiliteFine: 1.0 ok, 0.7 doubtful, 0.5 return imminent <3j, 0.3 sélection, 0 out */
function getDisponibiliteFine(
  isDoubtful: boolean,
  isAbsenceExplained: boolean,
  returnDate: string | undefined,
  nextMatchDate: Date | undefined
): number {
  if (returnDate && nextMatchDate) {
    const ret = new Date(returnDate);
    const matchTime = nextMatchDate.getTime();
    const retTime = ret.getTime();
    const diffDays = (matchTime - retTime) / (24 * 60 * 60 * 1000);
    if (diffDays < 0) return 0; // return après le match
    if (diffDays <= 2) return 0.5; // return 1-2j avant
  }
  if (isDoubtful) return 0.7;
  if (isAbsenceExplained) return 0.3; // sélection nationale
  return 1.0;
}

/** fatigueMult: 0→1.0, 1→0.98, 2→0.95, 3→0.90, 4→0.85, 5+→0.75 */
function getFatigueMult(matchsLast15Days: number): number {
  const t: Record<number, number> = { 0: 1.0, 1: 0.98, 2: 0.95, 3: 0.9, 4: 0.85 };
  return t[matchsLast15Days] ?? 0.75;
}

/**
 * Contexte prochain match : pertinence du joueur pour le prochain match.
 * (10 - rang/2)×0.4 + bonus_domicile×0.2 + bonus_matchup_poste×0.4
 * Plafonné à 0 minimum pour le terme rang.
 */
function getContexteProchainMatch(
  pos: Position,
  nextOpponentRank: number | undefined,
  isHome: boolean | undefined,
  opponentGoalsAgainst: number | undefined,
  opponentGoalsFor: number | undefined
): number {
  let termRang = 0;
  if (nextOpponentRank != null) {
    termRang = Math.max(0, (10 - nextOpponentRank / 2) * 0.4);
  }
  const bonusDomicile = isHome === true ? 10 * 0.2 : isHome === false ? 5 * 0.2 : (10 + 5) / 2 * 0.2;
  const GA = opponentGoalsAgainst ?? 30;
  const GF = opponentGoalsFor ?? 35;
  let bonusMatchup = 0;
  if (pos === "A") {
    if (GA >= 35) bonusMatchup = 10 * 0.4;
    else if (GA > 25) bonusMatchup = 5 * 0.4;
    else bonusMatchup = 0;
  } else if (pos === "D") {
    if (GF <= 30) bonusMatchup = 10 * 0.4;
    else if (GF < 40) bonusMatchup = 5 * 0.4;
    else bonusMatchup = 0;
  } else {
    const defBonus = GA >= 35 ? 4 : GA > 25 ? 2 : 0;
    const attBonus = GF <= 30 ? 4 : GF < 40 ? 2 : 0;
    bonusMatchup = (defBonus + attBonus) / 2;
  }
  return termRang + bonusDomicile + bonusMatchup;
}

/** returnDateMult: return après match → 0; return 1-2j avant → 0.7; sinon 1.0 */
function getReturnDateMult(
  injuryReturnDate: string | undefined,
  suspensionReturnDate: string | undefined,
  nextMatchDate: Date | undefined
): number {
  const ret = injuryReturnDate || suspensionReturnDate;
  if (!ret || !nextMatchDate) return 1.0;
  const retD = new Date(ret);
  const matchD = nextMatchDate;
  const diffDays = (matchD.getTime() - retD.getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays < 0) return 0;
  if (diffDays <= 2) return 0.7;
  return 1.0;
}

/**
 * Calcule le score selon la formule raffinée (orientée prochain match) :
 * base = formeRecentePonderee×0.25 + regularite×0.10 + perfOffensiveParPoste×0.25 + bonusCote×0.05
 *       + momentum×0.05 + bonusTitularisation×0.05 + contexteProchainMatch×0.25 + disponibiliteFine×0.15
 * Forme récente pondérée par minutes jouées (note × coeff_adv × min/90).
 * score = base × adversaryMult × homeAwayMult × fatigueMult × teamFormMult × returnDateMult × advAttackDefenseMult - pénalités
 */
export function computePlayerScore(
  player: EnrichedPlayer & PoolPlayer,
  options: {
    championshipDays?: number;
    injuredNames?: string[];
    injuredDoubtfulNames?: string[];
    injuredItems?: InjuryItemWithContext[];
    injuredDoubtfulItems?: InjuryItemWithContext[];
    opponentRank?: number;
    totalTeams?: number;
    absenceExplainedPlayerNames?: Set<string>;
    nextMatchDate?: Date;
    roundOpponentRankMap?: Map<number, Map<string, number>>;
    newsFormSignals?: { negative?: boolean };
  } = {}
): number {
  const {
    championshipDays = 15,
    injuredNames = [],
    injuredDoubtfulNames = [],
    injuredItems = [],
    injuredDoubtfulItems = [],
    opponentRank,
    totalTeams = 18,
    absenceExplainedPlayerNames,
    nextMatchDate,
    roundOpponentRankMap,
    newsFormSignals,
  } = options;

  const pName = player.name ?? "";
  const pClub = player.clubName;

  const isInjured =
    player.isInjured ||
    (injuredItems.length > 0 && isPlayerInjuryMatchWithContext(pName, pClub, injuredItems)) ||
    (injuredNames.length > 0 && isPlayerInInjuryList(pName, injuredNames));
  if (isInjured) return 0;

  const isSuspended = player.isSuspended === true;
  if (isSuspended) return 0;

  const isDoubtful =
    (injuredDoubtfulItems.length > 0 && isPlayerInjuryMatchWithContext(pName, pClub, injuredDoubtfulItems)) ||
    (injuredDoubtfulNames.length > 0 && isPlayerInInjuryList(pName, injuredDoubtfulNames));

  const isAbsenceExplained =
    absenceExplainedPlayerNames?.has(normalizePlayerName(pName)) ||
    (injuredDoubtfulItems.length > 0 && isPlayerInjuryMatchWithContext(pName, pClub, injuredDoubtfulItems)) ||
    (injuredDoubtfulNames.length > 0 && isPlayerInInjuryList(pName, injuredDoubtfulNames));

  const useStarMode = hasInsufficientData(player as PoolPlayer) && isAbsenceExplained;

  const pos = player.position ?? "M";
  const days = Math.max(1, championshipDays);

  let base: number;

  if (useStarMode) {
    const quotation = player.quotation ?? 0;
    const quotationScore = Math.min(10, quotation / 5);
    const averageScore = Math.min(10, player.average ?? 5);
    const pctTit = player.pctTitularisations ?? 0;
    const pctTitScore = pctTit * 10;
    base = 0.5 * quotationScore + 0.3 * averageScore + 0.2 * pctTitScore;
    if (pos === "A" && quotation > INSUFFICIENT_DATA_THRESHOLDS.attackerBonusQuotation) base += 1;
    base *= 0.8; // prudence retour blessure
  } else {
    const last5Notes = player.last5Notes;
    const last5Rounds = player.last5OpponentRounds ?? [];
    const roundMap = roundOpponentRankMap;
    const clubName = player.clubName;
    const tt = totalTeams || 18;

    let formeRecentePonderee: number;
    const last5Minutes = player.last5Minutes ?? [];
    if (roundMap?.size && last5Notes?.length && clubName) {
      let sumWeighted = 0;
      let sumWeights = 0;
      for (let i = 0; i < last5Notes.length; i++) {
        const note = last5Notes[i] ?? 5;
        const round = last5Rounds[i];
        const rank = round != null ? getOpponentRankForClubAndRound(roundMap, round, clubName) : undefined;
        const coeff = rank != null ? getOpponentCoeff(rank, tt) : 1.0;
        const minutes = last5Minutes[i] ?? 90;
        const weight = Math.min(90, Math.max(0, minutes)) / 90;
        sumWeighted += note * coeff * weight;
        sumWeights += weight;
      }
      formeRecentePonderee =
        sumWeights > 0 ? Math.min(10, sumWeighted / sumWeights) : (player.averageLast5 ?? player.average ?? 5);
    } else {
      formeRecentePonderee = player.averageLast5 ?? player.average ?? 5;
    }

    const regularite = Math.min(10, ((player.matchs ?? 0) / days) * 10);

    const goals = player.goals ?? 0;
    const assists = player.assists ?? 0;
    const xG = player.xG;
    const tackles = player.tackles ?? 0;
    const interceptions = player.interceptions ?? 0;
    const cleanSheets = player.cleanSheets ?? 0;
    const passPct = player.accuratePassPct ?? 0;

    let perfOffensiveParPoste: number;
    if (pos === "A") {
      const raw = (goals * 1.5 + (xG ?? goals) * 0.5 + assists * 0.8) / 5;
      perfOffensiveParPoste = Math.min(10, raw * 1.5);
    } else if (pos === "M") {
      const raw = assists * 1.2 + passPct * 0.3;
      perfOffensiveParPoste = Math.min(10, raw / 3);
    } else if (pos === "D") {
      const raw = tackles * 0.4 + interceptions * 0.4;
      perfOffensiveParPoste = raw > 0 ? Math.min(10, raw / 2) : Math.min(10, (goals + assists * 0.5) * 0.5);
    } else {
      perfOffensiveParPoste = cleanSheets > 0 ? Math.min(10, cleanSheets * 1.5 / 3) : Math.min(10, (goals + assists) * 0.3);
    }

    const bonusCote = Math.min(10, (player.quotation ?? 0) / 10);
    const momentumRaw = player.momentum ?? 0;
    const momentum = Math.max(0, Math.min(10, momentumRaw + 5));
    const pctTit = player.pctTitularisations ?? 0;
    const bonusTitularisation = pctTit > 0.7 ? Math.min(10, (pctTit - 0.7) * 20) : 0;
    const disponibiliteFine = getDisponibiliteFine(
      isDoubtful,
      isAbsenceExplained,
      player.injuryReturnDate ?? player.suspensionReturnDate,
      nextMatchDate
    );

    const contexteProchainMatch = getContexteProchainMatch(
      pos,
      player.nextOpponentRank ?? opponentRank,
      player.isHome,
      player.opponentGoalsAgainst,
      player.opponentGoalsFor
    );

    base =
      formeRecentePonderee * 0.25 +
      regularite * 0.1 +
      perfOffensiveParPoste * 0.25 +
      bonusCote * 0.05 +
      momentum * 0.05 +
      bonusTitularisation * 0.05 +
      contexteProchainMatch * 0.25 +
      disponibiliteFine * 0.15 * 10;
  }

  let adversaryMult = 1;
  const advRank = player.nextOpponentRank ?? opponentRank;
  if (advRank != null && totalTeams > 0) {
    if (advRank <= 3) adversaryMult = 0.85;
    else if (advRank <= 10) adversaryMult = 0.95;
    else if (advRank >= totalTeams - 2) adversaryMult = 1.25;
    else if (advRank >= totalTeams - 4) adversaryMult = 1.15;
  }

  let advAttackDefenseMult = 1;
  const oppGA = player.opponentGoalsAgainst;
  const oppGF = player.opponentGoalsFor;
  if (oppGA != null && oppGF != null) {
    const avgGA = 35;
    const avgGF = 30;
    if (pos === "A") {
      if (oppGA >= avgGA) advAttackDefenseMult = 1.15;
      else if (oppGA <= avgGA - 10) advAttackDefenseMult = 0.85;
    } else if (pos === "D") {
      if (oppGF <= avgGF) advAttackDefenseMult = 1.1;
      else if (oppGF >= avgGF + 10) advAttackDefenseMult = 0.85;
    }
  }

  const homeAwayMult = player.isHome === true ? 1.08 : player.isHome === false ? 0.92 : 1;
  const matchsLast15 = player.matchsLast15Days ?? player.last5Minutes?.filter((m) => (m ?? 0) > 0).length ?? 0;
  const fatigueMult = getFatigueMult(matchsLast15);
  const teamFormWins = player.teamFormWinsLast5 ?? 2;
  const teamFormMult = getTeamFormMultiplier(teamFormWins);
  const returnDateMult = getReturnDateMult(
    player.injuryReturnDate,
    player.suspensionReturnDate,
    nextMatchDate
  );

  let score = base * adversaryMult * homeAwayMult * fatigueMult * teamFormMult * returnDateMult * advAttackDefenseMult;

  if ((player.redCards ?? 0) > 0) score *= 0.7;
  else if ((player.yellowCards ?? 0) >= 4) score *= 0.95;
  if (player.transferredRecently) score *= 0.92;
  if (newsFormSignals?.negative) score *= 0.95;

  const m = player.matchs ?? 0;
  if (!useStarMode && m > 0 && m < MIN_MATCHES_FOR_STARTER) {
    score *= m / MIN_MATCHES_FOR_STARTER;
  }

  return Math.round(Math.max(0, Math.min(10, score)) * 100) / 100;
}

export interface ScoreOptions {
  championshipDays?: number;
  injuredNames?: string[];
  injuredDoubtful?: string[];
  injuredItems?: InjuryItemWithContext[];
  injuredDoubtfulItems?: InjuryItemWithContext[];
  opponentRank?: number;
  totalTeams?: number;
  absenceExplainedPlayerNames?: Set<string>;
  nextMatchDate?: Date;
  roundOpponentRankMap?: Map<number, Map<string, number>>;
  newsFormSignals?: { negative?: boolean };
}

/**
 * Sélectionne le meilleur 11 selon la formation
 */
export function selectBest11(
  players: EnrichedPlayer[],
  formation: number = 343,
  injuredNames: string[] = [],
  scoreOptions: ScoreOptions = {}
): EnrichedPlayer[] {
  const form = FORMATIONS[formation] ?? FORMATIONS[343];
  const byPos = { G: [] as EnrichedPlayer[], D: [] as EnrichedPlayer[], M: [] as EnrichedPlayer[], A: [] as EnrichedPlayer[] };
  const inj = [...injuredNames, ...(scoreOptions.injuredNames ?? [])];
  const doubt = scoreOptions.injuredDoubtful ?? [];
  const injItems = scoreOptions.injuredItems ?? [];
  const doubtItems = scoreOptions.injuredDoubtfulItems ?? [];

  for (const p of players) {
    const score = computePlayerScore(p, {
      injuredNames: inj,
      injuredDoubtfulNames: doubt,
      injuredItems: injItems,
      injuredDoubtfulItems: doubtItems,
      championshipDays: scoreOptions.championshipDays,
      opponentRank: scoreOptions.opponentRank,
      totalTeams: scoreOptions.totalTeams,
      absenceExplainedPlayerNames: scoreOptions.absenceExplainedPlayerNames,
      nextMatchDate: scoreOptions.nextMatchDate,
      roundOpponentRankMap: scoreOptions.roundOpponentRankMap,
      newsFormSignals: scoreOptions.newsFormSignals,
    });
    (p as EnrichedPlayer).recommendationScore = score;
    if (score > 0 && p.position) {
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
 */
export function getRecommendedTeam(
  squad: Record<string, unknown> | undefined,
  formation: number = 343,
  injuredNames: string[] = [],
  poolPlayers: PoolPlayer[] = [],
  scoreOptions: ScoreOptions = {}
): EnrichedPlayer[] {
  const players = extractPlayersFromSquad(squad, poolPlayers);
  return selectBest11(players, formation, injuredNames, scoreOptions);
}

/** Joueur non sélectionné (ni titulaire ni remplaçant) — "lofteur" */
export interface LofteurPlayer {
  name?: string;
  position?: Position;
  recommendationScore: number;
  /** Raison du score 0 : blessé ou suspendu */
  scoreZeroReason?: "injured" | "suspended";
}

/**
 * Retourne le meilleur 11, les remplaçants recommandés et les lofteurs (joueurs laissés au vestiaire)
 */
export function getRecommendedTeamWithSubstitutes(
  squad: Record<string, unknown> | undefined,
  formation: number = 343,
  injuredNames: string[] = [],
  poolPlayers: PoolPlayer[] = [],
  scoreOptions: ScoreOptions = {}
): { recommended: EnrichedPlayer[]; substitutes: Record<Position, SubstitutePlayer[]>; lofteurs: LofteurPlayer[] } {
  const players = extractPlayersFromSquad(squad, poolPlayers);
  const recommended = selectBest11(players, formation, injuredNames, scoreOptions);
  const substitutes = getRecommendedSubstitutes(players, recommended, formation);
  const key = (p: { id?: string; name?: string; position?: string }) =>
    p.id ?? `${p.name ?? ""}_${p.position ?? ""}`;
  const selectedKeys = new Set([
    ...recommended.map(key),
    ...(["G", "D", "M", "A"] as const).flatMap((pos) => (substitutes[pos] ?? []).map(key)),
  ]);
  const lofteurs: LofteurPlayer[] = players
    .filter((p) => !selectedKeys.has(key(p)))
    .map((p) => {
      const base: LofteurPlayer = { name: p.name, position: p.position, recommendationScore: p.recommendationScore };
      if (p.recommendationScore === 0) {
        base.scoreZeroReason = (p as { isSuspended?: boolean }).isSuspended === true ? "suspended" : "injured";
      }
      return base;
    });
  // #region agent log
  (async()=>{try{await fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({location:"recommendation.ts:getRecommendedTeamWithSubstitutes",message:"lofteurs computed",data:{playersCount:players.length,recommendedCount:recommended.length,selectedKeysSize:selectedKeys.size,lofteursCount:lofteurs.length},timestamp:Date.now(),hypothesisId:"H3,H4"})})}catch{}})();
  // #endregion
  return { recommended, substitutes, lofteurs };
}

/**
 * Sélectionne les 6 remplaçants champ + 1 gardien selon le template de formation.
 * Priorité aux joueurs avec score >= MIN_SUBSTITUTE_SCORE.
 * Si aucun >= 4 pour un poste : inclut quand même avec lowScoreReason.
 */
export function getRecommendedSubstitutes(
  players: EnrichedPlayer[],
  starters: EnrichedPlayer[],
  formation: number
): Record<Position, SubstitutePlayer[]> {
  const starterSet = new Set(starters);
  const bench = players.filter((p) => p.recommendationScore > 0 && !starterSet.has(p));

  const form = FORMATIONS[formation] ?? FORMATIONS[343];
  const template = BENCH_TEMPLATES[formation] ?? BENCH_TEMPLATES[343];

  const countByPos: Record<Position, number> = { G: 0, D: 0, M: 0, A: 0 };
  for (const p of players) {
    if (p.position) countByPos[p.position]++;
  }

  const maxSubsByPos: Record<Position, number> = {
    G: Math.max(0, countByPos.G - form.G),
    D: Math.max(0, countByPos.D - form.D),
    M: Math.max(0, countByPos.M - form.M),
    A: Math.max(0, countByPos.A - form.A),
  };

  const byPos = { G: [] as EnrichedPlayer[], D: [] as EnrichedPlayer[], M: [] as EnrichedPlayer[], A: [] as EnrichedPlayer[] };
  for (const p of bench) {
    if (p.position) byPos[p.position].push(p);
  }

  for (const pos of ["G", "D", "M", "A"] as const) {
    byPos[pos].sort((a, b) => b.recommendationScore - a.recommendationScore);
  }

  const result: Record<Position, SubstitutePlayer[]> = {
    G: [],
    D: [],
    M: [],
    A: [],
  };

  function toSubstitute(p: EnrichedPlayer): SubstitutePlayer {
    const sub: SubstitutePlayer = { ...p };
    if (p.recommendationScore < MIN_SUBSTITUTE_SCORE) {
      sub.lowScoreReason = getLowScoreReason(p);
    }
    return sub;
  }

  const neededG = Math.min(1, maxSubsByPos.G, template.G);
  if (neededG > 0 && byPos.G.length > 0) {
    result.G = byPos.G.slice(0, neededG).map(toSubstitute);
  }

  const outfieldTarget: Record<Position, number> = {
    G: 0,
    D: Math.min(template.D, maxSubsByPos.D),
    M: Math.min(template.M, maxSubsByPos.M),
    A: Math.min(template.A, maxSubsByPos.A),
  };

  const taken: Record<Position, number> = { G: 0, D: 0, M: 0, A: 0 };
  const outfield: SubstitutePlayer[] = [];

  for (const pos of ["D", "M", "A"] as const) {
    const target = outfieldTarget[pos];
    const available = byPos[pos];
    let count = 0;
    for (const p of available) {
      if (count >= target) break;
      outfield.push(toSubstitute(p));
      taken[pos] = ++count;
    }
  }

  if (outfield.length < 6) {
    const remaining: EnrichedPlayer[] = [];
    for (const pos of ["D", "M", "A"] as const) {
      const startIdx = taken[pos];
      remaining.push(...byPos[pos].slice(startIdx));
    }
    remaining.sort((a, b) => b.recommendationScore - a.recommendationScore);
    for (const p of remaining) {
      if (outfield.length >= 6) break;
      outfield.push(toSubstitute(p));
    }
  }

  const finalOutfield = outfield.slice(0, 6);

  result.D = finalOutfield.filter((p) => p.position === "D");
  result.M = finalOutfield.filter((p) => p.position === "M");
  result.A = finalOutfield.filter((p) => p.position === "A");

  return result;
}
