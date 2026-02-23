/**
 * Client API-Football - stats, blessures, fixtures
 * https://api-football.com/
 * 100 req/jour gratuit
 */

const API_FOOTBALL_URL = "https://v3.football.api-sports.io";

/** Saison européenne : année de début (2024 = 2024-2025). Plan gratuit limité à 2022-2024. */
export function getApiFootballSeason(): number {
  const now = new Date();
  const current = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Math.min(current, 2024); // Plan Free : max 2024
}

export interface ApiFootballPlayer {
  id: number;
  name: string;
  firstname?: string;
  lastname?: string;
  age?: number;
  birth?: { date?: string };
  nationality?: string;
  height?: string;
  weight?: string;
  photo?: string;
}

export interface ApiFootballPlayerStats {
  player: ApiFootballPlayer;
  statistics: Array<{
    team: { name: string };
    games: Array<{ position?: string }>;
    goals?: { total?: number };
  }>;
}

export interface ApiFootballInjury {
  player: { id: number; name: string };
  team: { name: string };
  fixture: { id: number };
  player_id: number;
  player_name: string;
  player_photo?: string;
  team_name: string;
  team_logo?: string;
  reason: string;
}

export interface ApiFootballFixture {
  fixture: { id: number; date: string };
  league: { name: string; round?: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

export interface ApiFootballStandingRow {
  rank: number;
  team: { id: number; name: string };
  all?: { played?: number };
}

export interface ApiFootballStandingsResponse {
  league?: { id?: number; name?: string };
  standings?: ApiFootballStandingRow[][];
}

export class ApiFootballClient {
  constructor(private apiKey: string) {}

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_FOOTBALL_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "api-football.ts:fetch",
        message: "HTTP request to API-Football",
        data: { endpoint, fullUrl: url.toString() },
        timestamp: Date.now(),
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion
    const res = await fetch(url.toString(), {
      headers: { "x-apisports-key": this.apiKey },
      cache: "no-store", // désactive le cache Next.js pour que chaque appel compte sur le dashboard
    });

    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "api-football.ts:fetch:response",
        message: "API-Football response received",
        data: { endpoint, status: res.status, ok: res.ok },
        timestamp: Date.now(),
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log(`[API-Football] ${endpoint} → HTTP ${res.status} ${res.ok ? "OK" : "ERREUR"}`);
    }

    if (!res.ok) throw new Error(`API-Football failed: ${res.status}`);
    const json = await res.json();
    return json.response ?? json;
  }

  /**
   * Recherche un joueur par nom (Ligue 1 = 61)
   */
  async searchPlayers(name: string, leagueId = 61): Promise<ApiFootballPlayer[]> {
    const res = await this.fetch<ApiFootballPlayer[]>(
      "/players",
      { search: name, league: String(leagueId) }
    );
    return Array.isArray(res) ? res : [];
  }

  /**
   * Récupère les blessures pour une ligue
   */
  async getInjuries(leagueId = 61, season = new Date().getFullYear()): Promise<ApiFootballInjury[]> {
    const res = await this.fetch<ApiFootballInjury[]>(
      "/injuries",
      { league: String(leagueId), season: String(season) }
    );
    return Array.isArray(res) ? res : [];
  }

  /**
   * Classement d'une ligue (Ligue 1=61, PL=39, Liga=140, L2=62, Serie A=5)
   */
  async getStandings(leagueId: number, season = new Date().getFullYear()): Promise<ApiFootballStandingRow[]> {
    const raw = await this.fetch<ApiFootballStandingsResponse[] | { response?: ApiFootballStandingsResponse[] }>(
      "/standings",
      { league: String(leagueId), season: String(season) }
    );
    const arr = Array.isArray(raw) ? raw : (raw as { response?: ApiFootballStandingsResponse[] })?.response ?? [];
    if (!arr.length) return [];
    const first = arr[0] as ApiFootballStandingsResponse;
    const rows = first.standings?.[0];
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Prochains matchs d'une ligue (par round/journée)
   * next=1 pour la prochaine journée
   */
  async getLeagueNextFixtures(leagueId: number, season = new Date().getFullYear(), next = 1): Promise<ApiFootballFixture[]> {
    const res = await this.fetch<ApiFootballFixture[]>(
      "/fixtures",
      { league: String(leagueId), season: String(season), next: String(next) }
    );
    return Array.isArray(res) ? res : [];
  }

  /**
   * Prochains matchs d'une équipe
   */
  async getTeamNextFixtures(teamId: number, count = 3): Promise<ApiFootballFixture[]> {
    const res = await this.fetch<ApiFootballFixture[]>(
      "/fixtures",
      { team: String(teamId), next: String(count) }
    );
    return Array.isArray(res) ? res : [];
  }

  /**
   * Stats joueur pour une saison
   */
  async getPlayerStats(playerId: number, season = new Date().getFullYear()) {
    const res = await this.fetch<ApiFootballPlayerStats[]>(
      "/players",
      { id: String(playerId), season: String(season) }
    );
    return Array.isArray(res) ? res : [];
  }
}

export function createApiFootballClient(apiKey: string): ApiFootballClient {
  return new ApiFootballClient(apiKey);
}
