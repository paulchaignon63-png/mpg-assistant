/**
 * Algorithme de recommandation - meilleur 11
 * Score = forme + disponibilité + difficulté adversaire
 */

import type { MpgPlayer } from "@/types/mpg";
import { getRotationPairKey, normalizeForRotation } from "./rotation-service";
import { hasReturnedBy } from "./return-date";
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

/**
 * Le score reste exprimé sur 10, comme les notes MPG. La formule pouvant
 * dépasser 17, un simple `Math.min(10, …)` écrasait sur 10.00 tous les bons
 * joueurs — un attaquant à 7 buts et un à 18 buts finissaient à égalité, et le
 * tri comme le capitaine suggéré devenaient arbitraires. On garde donc la
 * partie basse de l'échelle telle quelle et on comprime au-dessus du seuil,
 * de façon strictement croissante : 10 n'est jamais atteint, mais l'ordre est
 * préservé.
 */
const SCORE_SOFT_CAP = 8;
const SCORE_COMPRESSION = 6;

function toTenScale(raw: number): number {
  if (raw <= 0) return 0;
  if (raw <= SCORE_SOFT_CAP) return raw;
  const excess = raw - SCORE_SOFT_CAP;
  return SCORE_SOFT_CAP + (10 - SCORE_SOFT_CAP) * (1 - Math.exp(-excess / SCORE_COMPRESSION));
}

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

/** Seuils pour le mode "star de retour" (données insuffisantes) */
const INSUFFICIENT_DATA_THRESHOLDS = {
  minMatchs: 6,
  starQuotation: 30,
  attackerBonusQuotation: 35,
  pctTitularisationsThreshold: 0.8,
  pctTitMinQuotation: 15,
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
  /** Rang (force) de l'équipe DU joueur, 1 = meilleure. Clean sheet & création. */
  teamRank?: number;
  pctTitularisations?: number;
  yellowCards?: number;
  redCards?: number;
  /** Statuts résolus en amont contre l'effectif (cf. lib/status-aggregation). */
  isSuspended?: boolean;
  isInjured?: boolean;
  isDoubtful?: boolean;
  isAbsenceExplained?: boolean;
  /** Notes des 5 derniers matchs (MPGStats) */
  last5Notes?: number[];
  /** Minutes jouées par match (5 derniers) */
  last5Minutes?: number[];
  /** Numéro de journée par match (5 derniers) */
  last5OpponentRounds?: number[];
  /** Matchs joués sur les 15 derniers jours (proxy = matches avec minutes > 0) */
  matchsLast15Days?: number;
  /** Bug 2.1 : matchs joués en 7 jours dans autres compétitions (LDC, Coupe) */
  matchsLast7DaysOtherComps?: number;
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

/**
 * fatigueMult: 0→1.0, 1→0.98, 2→0.95, 3→0.90, 4→0.85, 5+→0.75.
 *
 * `matchsLast15Days` doit être un vrai décompte sur 15 jours (calculé à partir
 * des dates de match). Il était auparavant approximé par « nombre de matchs
 * joués parmi les 5 derniers », qui couvre environ cinq semaines : tout
 * titulaire régulier tombait donc à 5 et perdait 25 %, alors qu'un joueur
 * n'ayant joué aucun match n'était pas pénalisé. Sans dates disponibles, la
 * valeur est absente et seules les autres compétitions comptent.
 */
function getFatigueMult(matchsLast15Days: number, matchsLast7DaysOtherComps: number = 0): number {
  const total = matchsLast15Days + matchsLast7DaysOtherComps;
  const t: Record<number, number> = { 0: 1.0, 1: 0.98, 2: 0.95, 3: 0.9, 4: 0.85 };
  return t[total] ?? 0.75;
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

/**
 * Multiplicateur « force de l'équipe du joueur ».
 *
 * C'est la finesse qui distingue une vraie reco d'une simple recopie des notes :
 * un gardien/défenseur d'une grosse équipe (Lens, Marseille…) a une bien
 * meilleure espérance de points (clean sheet, victoire) qu'un joueur d'un
 * mal-classé, quasi indépendamment de sa dernière note. L'effet est le plus
 * fort pour G/D (défense collective), moindre pour A (une grosse équipe crée
 * plus d'occasions), et il est amplifié en début de saison, quand la forme
 * individuelle n'a pas encore de valeur statistique.
 */
function getOwnTeamMultiplier(
  pos: Position,
  teamRank: number | undefined,
  totalTeams: number,
  daysPlayed: number
): number {
  if (teamRank == null || totalTeams < 2) return 1;
  const strength = (totalTeams - teamRank) / (totalTeams - 1); // 1 = meilleure équipe
  const baseAmp = pos === "G" || pos === "D" ? 0.3 : pos === "A" ? 0.22 : 0.16;
  const youth = Math.max(0, Math.min(1, (5 - daysPlayed) / 5)); // 1 au coup d'envoi de la saison
  const amp = baseAmp * (1 + 0.3 * youth);
  return 1 + amp * (2 * strength - 1);
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
    opponentRank?: number;
    totalTeams?: number;
    nextMatchDate?: Date;
    roundOpponentRankMap?: Map<number, Map<string, number>>;
    newsFormSignals?: { negative?: boolean };
  } = {}
): number {
  const {
    championshipDays = 15,
    opponentRank,
    totalTeams = 18,
    nextMatchDate,
    roundOpponentRankMap,
    newsFormSignals,
  } = options;

  // NIVEAU 1 : blessé ou suspendu → score = 0.
  //
  // Les statuts sont résolus en amont contre l'effectif (lib/status-aggregation),
  // plus par rapprochement de noms ici : la liste à plat sans club court-circuitait
  // le contrôle par club et suffisait à sortir un homonyme du 11.
  //
  // Une absence est levée si la date de retour lue précède le coup d'envoi.
  // Sans date exploitable, hasReturnedBy renvoie false et le joueur reste écarté.
  if (player.isInjured === true && !hasReturnedBy(player.injuryReturnDate, nextMatchDate)) {
    return 0;
  }
  if (player.isSuspended === true && !hasReturnedBy(player.suspensionReturnDate, nextMatchDate)) {
    return 0;
  }

  const isDoubtful = player.isDoubtful === true;
  const isAbsenceExplained = player.isAbsenceExplained === true || isDoubtful;

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

    // La cote MPG culmine autour de 50 : /5 étale donc la valeur du joueur sur
    // toute l'échelle 0-10, là où /10 écrasait même les stars sous 5.
    const bonusCote = Math.min(10, (player.quotation ?? 0) / 5);
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

    // Pondérations : la valeur du joueur (cote) pesait 5 % — et valait 0 tant
    // que la cote n'était pas lue — si bien qu'un cadre du championnat pouvait
    // passer derrière un joueur moyen mieux loti sur le calendrier.
    //
    // Deux corrections, à somme constante :
    //  - la cote monte à 15 %, car c'est le meilleur résumé du niveau réel ;
    //  - le contexte du match descend à 20 %, parce qu'il est DÉJÀ appliqué
    //    ensuite en multiplicateurs (adversaire, domicile) : il comptait deux
    //    fois et écrasait la qualité intrinsèque ;
    //  - la régularité descend à 5 % : `matchs / journées` sature à 10 pour
    //    tout titulaire et n'apporte donc presque aucune information.
    base =
      formeRecentePonderee * 0.25 +
      regularite * 0.05 +
      perfOffensiveParPoste * 0.25 +
      bonusCote * 0.15 +
      momentum * 0.05 +
      bonusTitularisation * 0.05 +
      contexteProchainMatch * 0.2 +
      disponibiliteFine * 0.15 * 10;
  }

  // Force de l'adversaire, en continu.
  //
  // Les paliers précédents (0,85 / 0,95 / 1,15 / 1,25) créaient des falaises
  // arbitraires — 21 % d'écart entre affronter le 13e et le 14e — et une
  // amplitude de ±25 % pour un seul match. Comme l'adversaire est DÉJÀ compté
  // dans la base (contexteProchainMatch), cela le comptait deux fois et le
  // calendrier finissait par peser plus lourd que le niveau du joueur.
  //
  // Une rampe linéaire garde le même sens (affronter le leader pénalise,
  // affronter le dernier avantage) sans marche d'escalier ni sur-pondération.
  let adversaryMult = 1;
  const advRank = player.nextOpponentRank ?? opponentRank;
  if (advRank != null && totalTeams > 1) {
    const weakness = (Math.min(advRank, totalTeams) - 1) / (totalTeams - 1); // 0 = leader
    adversaryMult = 0.88 + 0.24 * weakness;
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
  const matchsLast15 = player.matchsLast15Days ?? 0;
  const matchsLast7Other = player.matchsLast7DaysOtherComps ?? 0;
  const fatigueMult = getFatigueMult(matchsLast15, matchsLast7Other);
  const teamFormWins = player.teamFormWinsLast5 ?? 2;
  const teamFormMult = getTeamFormMultiplier(teamFormWins);
  const returnDateMult = getReturnDateMult(
    player.injuryReturnDate,
    player.suspensionReturnDate,
    nextMatchDate
  );

  const ownTeamMult = getOwnTeamMultiplier(pos, player.teamRank, totalTeams, days);

  let score =
    base *
    adversaryMult *
    homeAwayMult *
    fatigueMult *
    teamFormMult *
    returnDateMult *
    advAttackDefenseMult *
    ownTeamMult;

  const rc = player.redCards ?? 0;
  if (rc >= 3) score *= 0.82;
  else if (rc === 2) score *= 0.87;
  else if (rc === 1) score *= 0.93;
  if ((player.yellowCards ?? 0) >= 4) score *= 0.95;
  if (player.transferredRecently) score *= 0.92;
  if (newsFormSignals?.negative) score *= 0.95;

  // Pénalité « peu de matchs joués » : évite de titulariser un joueur à 1 match
  // quand d'autres en ont 15. Mais le seuil doit rester cohérent avec l'avancée
  // de la saison — en début de championnat personne n'a joué 5 matchs, pénaliser
  // sur un seuil fixe écraserait tout le monde. On plafonne donc le seuil au
  // nombre de journées déjà disputées.
  const m = player.matchs ?? 0;
  const effectiveMinMatches = Math.min(MIN_MATCHES_FOR_STARTER, Math.max(0, days));
  if (!useStarMode && m > 0 && effectiveMinMatches > 0 && m < effectiveMinMatches) {
    score *= m / effectiveMinMatches;
  }

  return Math.round(toTenScale(Math.max(0, score)) * 100) / 100;
}

export interface ScoreOptions {
  championshipDays?: number;
  opponentRank?: number;
  totalTeams?: number;
  nextMatchDate?: Date;
  roundOpponentRankMap?: Map<number, Map<string, number>>;
  newsFormSignals?: { negative?: boolean };
  /** Bug 2.2 : paires (clubNorm_pos_key1_key2) à ne pas recommander ensemble */
  rotationLowPairs?: Set<string>;
}

/**
 * Sélectionne le meilleur 11 selon la formation
 */
export function selectBest11(
  players: EnrichedPlayer[],
  formation: number = 343,
  scoreOptions: ScoreOptions = {}
): EnrichedPlayer[] {
  const form = FORMATIONS[formation] ?? FORMATIONS[343];
  const byPos = { G: [] as EnrichedPlayer[], D: [] as EnrichedPlayer[], M: [] as EnrichedPlayer[], A: [] as EnrichedPlayer[] };

  for (const p of players) {
    const score = computePlayerScore(p, {
      championshipDays: scoreOptions.championshipDays,
      opponentRank: scoreOptions.opponentRank,
      totalTeams: scoreOptions.totalTeams,
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
  const rotationLowPairs = scoreOptions.rotationLowPairs ?? new Set<string>();
  for (const pos of ["G", "D", "M", "A"] as const) {
    const needed = form[pos];
    const sorted = byPos[pos].sort((a, b) => b.recommendationScore - a.recommendationScore);
    const picked: EnrichedPlayer[] = [];
    for (const p of sorted) {
      if (picked.length >= needed) break;
      const clubNorm = p.clubName ? normalizeForRotation(p.clubName) : "";
      const keyNorm = p.name ? normalizeForRotation(p.name) : "";
      const blocked = rotationLowPairs.size > 0 && clubNorm && keyNorm && picked.some((prev) => {
        const prevClub = prev.clubName ? normalizeForRotation(prev.clubName) : "";
        const prevKey = prev.name ? normalizeForRotation(prev.name) : "";
        if (prevClub !== clubNorm) return false;
        const pairKey = getRotationPairKey(clubNorm, pos, prevKey, keyNorm);
        return rotationLowPairs.has(pairKey);
      });
      if (!blocked) picked.push(p as EnrichedPlayer);
    }
    selected.push(...picked);
  }
  return selected;
}

/**
 * Extrait les joueurs du squad MPG et retourne le meilleur 11
 */
export function getRecommendedTeam(
  squad: Record<string, unknown> | undefined,
  formation: number = 343,
  poolPlayers: PoolPlayer[] = [],
  scoreOptions: ScoreOptions = {}
): EnrichedPlayer[] {
  const players = extractPlayersFromSquad(squad, poolPlayers);
  return selectBest11(players, formation, scoreOptions);
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
  poolPlayers: PoolPlayer[] = [],
  scoreOptions: ScoreOptions = {}
): { recommended: EnrichedPlayer[]; substitutes: Record<Position, SubstitutePlayer[]>; lofteurs: LofteurPlayer[] } {
  const players = extractPlayersFromSquad(squad, poolPlayers);
  const recommended = selectBest11(players, formation, scoreOptions);
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

/**
 * Propose un capitaine parmi le 11 recommandé : le joueur avec le meilleur score
 * (celui que l'app estime le plus à même d'avoir une bonne note → bonus MPG).
 */
export function getSuggestedCaptain(recommended: EnrichedPlayer[]): EnrichedPlayer | null {
  if (recommended.length === 0) return null;
  let best = recommended[0];
  for (let i = 1; i < recommended.length; i++) {
    if (recommended[i].recommendationScore > best.recommendationScore) best = recommended[i];
  }
  return best;
}
