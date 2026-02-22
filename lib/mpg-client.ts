/**
 * Client MPG - API non officielle
 * Basé sur mpg-coach-bot (https://github.com/axel3rd/mpg-coach-bot)
 */

import type {
  UserSignIn,
  Dashboard,
  Division,
  Team,
  Coach,
} from "@/types/mpg";

const MPG_API_URL = "https://api.mpg.football";

export class MpgClient {
  private token: string | null = null;
  private userId: string | null = null;

  /**
   * Connexion simple (comptes avant février 2025)
   */
  async signIn(login: string, password: string): Promise<UserSignIn> {
    const res = await fetch(`${MPG_API_URL}/user/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login,
        password,
        language: "fr-FR",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MPG Auth failed: ${res.status} - ${text}`);
    }

    const data: UserSignIn = await res.json();
    this.token = data.token;
    this.userId = data.userId;
    return data;
  }

  private getHeaders(): HeadersInit {
    if (!this.token) throw new Error("Not authenticated");
    return {
      Authorization: this.token,
      "Content-Type": "application/json",
    };
  }

  async getDashboard(): Promise<Dashboard> {
    const res = await fetch(`${MPG_API_URL}/dashboard/leagues`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Dashboard failed: ${res.status}`);
    return res.json();
  }

  async getDivision(divisionId: string): Promise<Division> {
    const id = divisionId.startsWith("mpg_division_") ? divisionId : `mpg_division_${divisionId}`;
    const res = await fetch(`${MPG_API_URL}/division/${id}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Division failed: ${res.status}`);
    return res.json();
  }

  async getTeam(teamId: string): Promise<Team> {
    const id = teamId.startsWith("mpg_team_") ? teamId : `mpg_team_${teamId}`;
    const res = await fetch(`${MPG_API_URL}/team/${id}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Team failed: ${res.status}`);
    return res.json();
  }

  async getCoach(divisionId: string): Promise<Coach> {
    const id = divisionId.startsWith("mpg_division_") ? divisionId : `mpg_division_${divisionId}`;
    const res = await fetch(`${MPG_API_URL}/division/${id}/coach`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Coach failed: ${res.status}`);
    return res.json();
  }

  getUserId(): string {
    if (!this.userId) throw new Error("Not authenticated");
    return this.userId;
  }

  setToken(token: string, userId: string) {
    this.token = token;
    this.userId = userId;
  }
}

export function createMpgClient(): MpgClient {
  return new MpgClient();
}
