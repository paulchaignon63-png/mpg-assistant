/**
 * Client API-Football - stats, blessures, fixtures
 * https://api-football.com/
 * 100 req/jour gratuit
 */

const API_FOOTBALL_URL = "https://v3.football.api-sports.io";

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
  league: { name: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

export class ApiFootballClient {
  constructor(private apiKey: string) {}

  private async fetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_FOOTBALL_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), {
      headers: { "x-apisports-key": this.apiKey },
    });
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
