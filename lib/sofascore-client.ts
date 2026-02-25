/**
 * Client Sofascore - classement, matchs, effectifs
 * API interne non officielle (api.sofascore.com)
 */

const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/** championshipId MPG → unique-tournament Sofascore */
const CHAMP_TO_SOFASCORE: Record<string, number> = {
  "1": 34,
  LIGUE_1: 34,
  "2": 17,
  PREMIER_LEAGUE: 17,
  "3": 8,
  LIGA: 8,
  "4": 182,
  LIGUE_2: 182,
  "5": 23,
  SERIE_A: 23,
  "6": 7,
  CHAMPIONS_LEAGUE: 7,
  "7": 238,
  LIGUE_SUPER: 238,
};

export interface SofascoreStandingRow {
  team: { id: number; name: string; slug?: string };
  position?: number;
  rank?: number;
}

export interface SofascoreEvent {
  id: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  startTimestamp: number;
  status: { code: number; description?: string };
}

export interface SofascoreTeamStats {
  goalsFor: number;
  goalsAgainst: number;
}

export interface SofascoreStandingsResult {
  rankByClub: Map<string, number>;
  totalTeams: number;
  teamStatsByClub?: Map<string, SofascoreTeamStats>;
  isHomeByClub?: Map<string, boolean>;
  /** Rang (1-based) -> nom normalisé du club */
  clubByRank?: Map<number, string>;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function getUniqueTournamentId(championshipId: number | string): number | null {
  const key = String(championshipId);
  return CHAMP_TO_SOFASCORE[key] ?? null;
}

/**
 * Récupère la saison courante/en cours pour un tournoi
 * seasons[0] = prochaine (ex 25/26), seasons[1] = en cours (ex 24/25)
 */
async function getCurrentSeasonId(uniqueTournamentId: number): Promise<number | null> {
  const data = await fetchJson<{ seasons?: Array<{ id: number; year: string }> }>(
    `${SOFASCORE_BASE}/unique-tournament/${uniqueTournamentId}/seasons`
  );
  const seasons = data?.seasons;
  if (!seasons?.length) return null;
  const now = Math.floor(Date.now() / 1000);
  if (seasons.length >= 2) {
    const nextStart = await getFirstEventTimestamp(uniqueTournamentId, seasons[0].id);
    if (nextStart != null && nextStart > now) return seasons[1].id;
  }
  return seasons[0].id;
}

async function getFirstEventTimestamp(tid: number, sid: number): Promise<number | null> {
  const d = await fetchJson<{ events?: Array<{ startTimestamp: number }> }>(
    `${SOFASCORE_BASE}/unique-tournament/${tid}/season/${sid}/events/round/1`
  );
  return d?.events?.[0]?.startTimestamp ?? null;
}

/**
 * Récupère le classement et les prochains matchs pour calculer le rang de l'adversaire
 */
export async function fetchSofascoreStandingsAndFixtures(
  championshipId: number | string
): Promise<SofascoreStandingsResult | null> {
  const tid = getUniqueTournamentId(championshipId);
  if (tid == null) return null;

  const seasonId = await getCurrentSeasonId(tid);
  if (seasonId == null) return null;

  const standingsData = await fetchJson<{
    standings?: Array<{
      rows?: Array<{
        team: { name: string };
        position?: number;
        scoresFor?: number;
        scoresAgainst?: number;
      }>;
    }>;
  }>(`${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/standings/total`);

  const standings = standingsData?.standings?.[0]?.rows;
  if (!standings?.length) return null;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

  const rankByClub = new Map<string, number>();
  const teamStatsByClub = new Map<string, { goalsFor: number; goalsAgainst: number }>();
  const clubByRank = new Map<number, string>();
  for (const row of standings) {
    const name = row.team?.name ?? "";
    const rank = row.position ?? standings.indexOf(row) + 1;
    if (name) {
      const norm = normalize(name);
      rankByClub.set(norm, rank);
      clubByRank.set(rank, norm);
      const gf = (row as { scoresFor?: number }).scoresFor ?? 0;
      const ga = (row as { scoresAgainst?: number }).scoresAgainst ?? 0;
      teamStatsByClub.set(norm, { goalsFor: gf, goalsAgainst: ga });
    }
  }

  const now = Math.floor(Date.now() / 1000);
  let upcomingEvents: SofascoreEvent[] = [];
  for (let round = 15; round <= 35 && upcomingEvents.length === 0; round++) {
    const eventsData = await fetchJson<{ events?: SofascoreEvent[] }>(
      `${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/events/round/${round}`
    );
    const ev = (eventsData?.events ?? []).filter((e) => e.startTimestamp > now);
    if (ev.length > 0) upcomingEvents = ev;
  }

  if (upcomingEvents.length === 0) return null;

  const clubToOpponent: Array<{ club: string; opponent: string; isHome: boolean }> = [];
  const isHomeByClub = new Map<string, boolean>();
  for (const e of upcomingEvents.slice(0, 20)) {
    const home = e.homeTeam?.name ?? "";
    const away = e.awayTeam?.name ?? "";
    if (home) {
      clubToOpponent.push({ club: home, opponent: away, isHome: true });
      isHomeByClub.set(normalize(home), true);
    }
    if (away) {
      clubToOpponent.push({ club: away, opponent: home, isHome: false });
      isHomeByClub.set(normalize(away), false);
    }
  }

  const result = new Map<string, number>();
  for (const { club, opponent } of clubToOpponent) {
    const oppNorm = normalize(opponent);
    let rank: number | undefined = rankByClub.get(oppNorm);
    if (rank == null) {
      for (const [k, v] of rankByClub) {
        if (k.includes(oppNorm) || oppNorm.includes(k)) {
          rank = v;
          break;
        }
      }
    }
    if (rank != null) {
      const clubNorm = normalize(club);
      const existing = result.get(clubNorm);
      if (existing == null || rank < existing) result.set(clubNorm, rank);
    }
  }

  if (result.size === 0) return null;

  return {
    rankByClub: result,
    totalTeams: Math.max(18, standings.length),
    teamStatsByClub: teamStatsByClub.size > 0 ? teamStatsByClub : undefined,
    isHomeByClub: isHomeByClub.size > 0 ? isHomeByClub : undefined,
    clubByRank: clubByRank.size > 0 ? clubByRank : undefined,
  };
}

export interface NextMatchdayResult {
  firstMatchTimestamp: number;
  gameWeek: number;
}

/**
 * Récupère le timestamp du premier match de la prochaine journée.
 * Parcourt les rounds (1 à 40) et retourne le premier match à venir.
 */
export async function getNextMatchdayFirstMatch(
  championshipId: number | string
): Promise<NextMatchdayResult | null> {
  const tid = getUniqueTournamentId(championshipId);
  if (tid == null) return null;

  const seasonId = await getCurrentSeasonId(tid);
  if (seasonId == null) return null;

  const now = Math.floor(Date.now() / 1000);
  for (let round = 1; round <= 40; round++) {
    const eventsData = await fetchJson<{ events?: SofascoreEvent[] }>(
      `${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/events/round/${round}`
    );
    const events = (eventsData?.events ?? []).filter((e) => e.startTimestamp > now);
    if (events.length > 0) {
      const first = events.sort((a, b) => a.startTimestamp - b.startTimestamp)[0];
      return {
        firstMatchTimestamp: first!.startTimestamp,
        gameWeek: round,
      };
    }
  }
  return null;
}

/** Stats joueur agrégées depuis Sofascore (lineups + incidents) */
export interface SofascorePlayerStats {
  average: number;
  matchs: number;
  goals: number;
  assists: number;
  pctTitularisations: number;
  yellowCards: number;
  redCards: number;
  xG?: number;
  tackles?: number;
  interceptions?: number;
  ballRecovery?: number;
  shotsOnTarget?: number;
  accuratePassPct?: number;
  cleanSheets?: number;
  saves?: number;
}

export interface SofascoreMatchResult {
  round: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  startTimestamp: number;
}

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Structure lineups Sofascore (API non documentée) */
interface SofascoreLineupPlayer {
  player?: { id?: number; name?: string };
  statistics?: {
    rating?: number;
    goalAssist?: number;
    [k: string]: unknown;
  };
  substitute?: boolean;
}

interface SofascoreLineupsResponse {
  home?: { players?: SofascoreLineupPlayer[] };
  away?: { players?: SofascoreLineupPlayer[] };
}

interface SofascoreIncident {
  incidentType?: string;
  incidentClass?: string;
  player?: { id?: number; name?: string };
}

interface SofascoreIncidentsResponse {
  incidents?: SofascoreIncident[];
}

/**
 * Récupère les stats joueurs (ratings, titularisations, cartons, assists) depuis Sofascore.
 * Parcourt les événements de la saison, lineups + incidents par match terminé.
 */
export async function getSofascorePlayerStats(
  championshipId: number | string
): Promise<Map<string, SofascorePlayerStats>> {
  const tid = getUniqueTournamentId(championshipId);
  if (tid == null) return new Map();

  const seasonId = await getCurrentSeasonId(tid);
  if (seasonId == null) return new Map();

  const aggregated = new Map<
    string,
    {
      ratings: number[];
      titularisations: number;
      matchs: number;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
    }
  >();

  const maxRounds = 42;
  const eventIdsSeen = new Set<number>();

  for (let round = 1; round <= maxRounds; round++) {
    const eventsData = await fetchJson<{ events?: SofascoreEvent[] }>(
      `${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/events/round/${round}`
    );
    const events = (eventsData?.events ?? []).filter((e) => e.status?.code === 100);
    if (events.length === 0 && round > 5) break;

    for (const ev of events) {
      if (eventIdsSeen.has(ev.id)) continue;
      eventIdsSeen.add(ev.id);

      const [lineupsData, incidentsData] = await Promise.all([
        fetchJson<SofascoreLineupsResponse>(`${SOFASCORE_BASE}/event/${ev.id}/lineups`),
        fetchJson<SofascoreIncidentsResponse>(`${SOFASCORE_BASE}/event/${ev.id}/incidents`),
      ]);

      const allPlayers: SofascoreLineupPlayer[] = [
        ...(lineupsData?.home?.players ?? []),
        ...(lineupsData?.away?.players ?? []),
      ];

      for (const lp of allPlayers) {
        const name = lp.player?.name?.trim();
        if (!name) continue;
        const key = normalizePlayerName(name);

        let entry = aggregated.get(key);
        if (!entry) {
          entry = {
            ratings: [],
            titularisations: 0,
            matchs: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
          };
          aggregated.set(key, entry);
        }

        entry.matchs += 1;
        const rating = lp.statistics?.rating;
        if (typeof rating === "number" && rating > 0) {
          entry.ratings.push(rating);
        }
        if (lp.substitute === false) {
          entry.titularisations += 1;
        }
        const assist = lp.statistics?.goalAssist;
        if (typeof assist === "number" && assist > 0) {
          entry.assists += assist;
        }
        const goalsFromStat =
          (lp.statistics?.goals ?? lp.statistics?.totalGoal) as number | undefined;
        if (typeof goalsFromStat === "number" && goalsFromStat > 0) {
          entry.goals += goalsFromStat;
        }
      }

      for (const inc of incidentsData?.incidents ?? []) {
        if (inc.incidentType !== "goal" || !inc.player?.name) continue;
        const name = inc.player.name.trim();
        const key = normalizePlayerName(name);

        let entry = aggregated.get(key);
        if (!entry) {
          entry = {
            ratings: [],
            titularisations: 0,
            matchs: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
          };
          aggregated.set(key, entry);
        }
        entry.goals += 1;
      }

      for (const inc of incidentsData?.incidents ?? []) {
        if (inc.incidentType !== "card" || !inc.player?.name) continue;
        const name = inc.player.name.trim();
        const key = normalizePlayerName(name);

        let entry = aggregated.get(key);
        if (!entry) {
          entry = {
            ratings: [],
            titularisations: 0,
            matchs: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
          };
          aggregated.set(key, entry);
        }

        const cardType = (inc.incidentClass ?? "").toLowerCase();
        if (cardType === "red" || cardType === "yellowred") {
          entry.redCards += 1;
        } else if (cardType === "yellow") {
          entry.yellowCards += 1;
        }
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  const result = new Map<string, SofascorePlayerStats>();
  for (const [key, entry] of aggregated) {
    const avgRating =
      entry.ratings.length > 0
        ? entry.ratings.reduce((a, b) => a + b, 0) / entry.ratings.length
        : 5;
    const pctTit =
      entry.matchs > 0 ? Math.round((entry.titularisations / entry.matchs) * 1000) / 1000 : 0;

    result.set(key, {
      average: Math.round(avgRating * 100) / 100,
      matchs: entry.matchs,
      goals: entry.goals,
      assists: entry.assists,
      pctTitularisations: pctTit,
      yellowCards: entry.yellowCards,
      redCards: entry.redCards,
    });
  }

  return result;
}

/**
 * Récupère les résultats des matchs terminés (scores par round).
 */
export async function getSofascoreMatchResults(
  championshipId: number | string,
  maxRounds = 20
): Promise<SofascoreMatchResult[]> {
  const tid = getUniqueTournamentId(championshipId);
  if (tid == null) return [];

  const seasonId = await getCurrentSeasonId(tid);
  if (seasonId == null) return [];

  const results: SofascoreMatchResult[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (let round = 1; round <= maxRounds; round++) {
    const eventsData = await fetchJson<{
      events?: Array<{
        id: number;
        homeTeam?: { name: string };
        awayTeam?: { name: string };
        startTimestamp?: number;
        status?: { code?: number };
      }>;
    }>(`${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/events/round/${round}`);
    const events = (eventsData?.events ?? []).filter((e) => e.status?.code === 100 && (e.startTimestamp ?? 0) < now);
    if (events.length === 0 && round > 5) continue;

    for (const ev of events) {
      const eventDetail = await fetchJson<{
        event?: {
          homeScore?: { current?: number; display?: number };
          awayScore?: { current?: number; display?: number };
          homeTeam?: { name?: string };
          awayTeam?: { name?: string };
          roundInfo?: { round?: number };
          startTimestamp?: number;
        };
      }>(`${SOFASCORE_BASE}/event/${ev.id}`);
      const e = eventDetail?.event;
      if (!e) continue;
      const home = e.homeTeam?.name ?? (ev as { homeTeam?: { name?: string } }).homeTeam?.name ?? "";
      const away = e.awayTeam?.name ?? (ev as { awayTeam?: { name?: string } }).awayTeam?.name ?? "";
      const hs = e.homeScore;
      const as = e.awayScore;
      const homeScore = typeof hs === "object" ? (hs?.current ?? hs?.display ?? 0) : (hs ?? 0);
      const awayScore = typeof as === "object" ? (as?.current ?? as?.display ?? 0) : (as ?? 0);
      results.push({
        round: e.roundInfo?.round ?? round,
        homeTeam: home,
        awayTeam: away,
        homeScore: typeof homeScore === "number" ? homeScore : 0,
        awayScore: typeof awayScore === "number" ? awayScore : 0,
        startTimestamp: e.startTimestamp ?? ev.startTimestamp ?? 0,
      });
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return results;
}

/**
 * Récupère les stats détaillées joueurs (xG, tackles, interceptions, saves, cleanSheets).
 * Enrichit getSofascorePlayerStats avec les champs additionnels de l'API.
 */
export async function getSofascorePlayerDetailedStats(
  championshipId: number | string
): Promise<Map<string, SofascorePlayerStats>> {
  const baseMap = await getSofascorePlayerStats(championshipId);
  const tid = getUniqueTournamentId(championshipId);
  if (tid == null) return baseMap;

  const seasonId = await getCurrentSeasonId(tid);
  if (seasonId == null) return baseMap;

  const detailed = new Map<
    string,
    {
      xG: number;
      tackles: number;
      interceptions: number;
      ballRecovery: number;
      shotsOnTarget: number;
      accuratePass: number;
      totalPass: number;
      cleanSheets: number;
      saves: number;
      matchs: number;
    }
  >();

  const maxRounds = 25;
  const eventIdsSeen = new Set<number>();

  for (let round = 1; round <= maxRounds; round++) {
    const eventsData = await fetchJson<{
      events?: Array<{ id: number; homeTeam?: { name: string }; awayTeam?: { name: string }; status?: { code?: number }; homeScore?: { current?: number }; awayScore?: { current?: number } }>;
    }>(`${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/events/round/${round}`);
    const events = (eventsData?.events ?? []).filter((e) => e.status?.code === 100);
    if (events.length === 0 && round > 5) break;

    for (const ev of events) {
      if (eventIdsSeen.has(ev.id)) continue;
      eventIdsSeen.add(ev.id);

      const [lineupsData, eventDetail] = await Promise.all([
        fetchJson<{
          home?: { players?: Array<{ player?: { name?: string }; statistics?: Record<string, unknown> }> };
          away?: { players?: Array<{ player?: { name?: string }; statistics?: Record<string, unknown> }> };
        }>(`${SOFASCORE_BASE}/event/${ev.id}/lineups`),
        fetchJson<{ event?: { homeScore?: { current?: number }; awayScore?: { current?: number } } }>(`${SOFASCORE_BASE}/event/${ev.id}`),
      ]);
      const evScore = eventDetail?.event;
      const homeConceded = evScore?.awayScore?.current ?? 0;
      const awayConceded = evScore?.homeScore?.current ?? 0;

      const processPlayers = (
        players: Array<{ player?: { name?: string }; statistics?: Record<string, unknown>; substitute?: boolean }> | undefined,
        _isHome: boolean,
        conceded: number
      ) => {
        for (const lp of players ?? []) {
          const name = lp.player?.name?.trim();
          if (!name) continue;
          const key = normalizePlayerName(name);
          const stats = lp.statistics ?? {};

          let entry = detailed.get(key);
          if (!entry) {
            entry = {
              xG: 0,
              tackles: 0,
              interceptions: 0,
              ballRecovery: 0,
              shotsOnTarget: 0,
              accuratePass: 0,
              totalPass: 0,
              cleanSheets: 0,
              saves: 0,
              matchs: 0,
            };
            detailed.set(key, entry);
          }
          entry.matchs += 1;
          entry.xG += (typeof stats.expectedGoals === "number" ? stats.expectedGoals : 0) +
            (typeof stats.expectedAssists === "number" ? stats.expectedAssists : 0);
          entry.tackles += typeof stats.totalTackle === "number" ? stats.totalTackle : (typeof stats.tackle === "number" ? stats.tackle : 0);
          entry.interceptions += typeof stats.interceptionWon === "number" ? stats.interceptionWon : 0;
          entry.ballRecovery += typeof stats.ballRecovery === "number" ? stats.ballRecovery : 0;
          entry.shotsOnTarget += typeof stats.accurateShotsTotal === "number" ? stats.accurateShotsTotal : (typeof stats.shotOnTarget === "number" ? stats.shotOnTarget : 0);
          entry.accuratePass += typeof stats.accuratePass === "number" ? stats.accuratePass : 0;
          entry.totalPass += typeof stats.totalPass === "number" ? stats.totalPass : 0;
          entry.saves += typeof stats.saves === "number" ? stats.saves : (typeof stats.savedShotsFromInsideTheBox === "number" ? stats.savedShotsFromInsideTheBox : 0);
          if (conceded === 0) entry.cleanSheets += 1;
        }
      };

      processPlayers(lineupsData?.home?.players, true, homeConceded);
      processPlayers(lineupsData?.away?.players, false, awayConceded);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  const result = new Map<string, SofascorePlayerStats>();
  for (const [key, base] of baseMap) {
    const det = detailed.get(key);
    const stats: SofascorePlayerStats = {
      ...base,
      ...(det && {
        xG: Math.round(det.xG * 100) / 100,
        tackles: det.tackles,
        interceptions: det.interceptions,
        ballRecovery: det.ballRecovery,
        shotsOnTarget: det.shotsOnTarget,
        accuratePassPct: det.totalPass > 0 ? Math.round((det.accuratePass / det.totalPass) * 1000) / 1000 : undefined,
        cleanSheets: det.cleanSheets,
        saves: det.saves,
      }),
    };
    result.set(key, stats);
  }
  return result;
}
