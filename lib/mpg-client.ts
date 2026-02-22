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
import { signInOidc } from "./mpg-oidc";

const MPG_API_URL = "https://api.mpg.football";

const CHAMPIONSHIP_MAP: Record<string, number> = {
  LIGUE_1: 1,
  PREMIER_LEAGUE: 2,
  LIGA: 3,
  LIGUE_2: 4,
  SERIE_A: 5,
  CHAMPIONS_LEAGUE: 6,
  LIGUE_SUPER: 7,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
};

function normalizeChampionshipId(id: number | string): number {
  if (typeof id === "number") return id;
  return (CHAMPIONSHIP_MAP[id] ?? parseInt(id, 10)) || 1;
}

function normalizePoolPlayer(p: Record<string, unknown>): {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  quotation?: number;
  average?: number;
  matchs?: number;
  goals?: number;
  clubId?: string;
  clubName?: string;
} {
  const id = String(p.id ?? p.i ?? p._id ?? "").trim() || undefined;
  const firstName = String(p.firstName ?? p.f ?? "").trim() || undefined;
  const lastName = (typeof p.n === "string" ? String(p.n) : String(p.lastName ?? "")).trim() || undefined;
  const name =
    String(p.name ?? "").trim() ||
    [lastName, firstName].filter(Boolean).join(" ").trim() ||
    undefined;
  const position = String(p.position ?? p.p ?? p.fp ?? "").trim() || undefined;
  const quotation = typeof p.quotation === "number" ? p.quotation : typeof p.q === "number" ? p.q : typeof p.r === "number" ? p.r : undefined;
  const s = p.s as Record<string, unknown> | undefined;
  const average = typeof p.average === "number" ? p.average : (typeof p.a === "number" ? p.a : (s && typeof s.a === "number" ? s.a : undefined));
  const matchs = typeof p.matchs === "number" ? p.matchs : (s && typeof s.n === "number" ? s.n : undefined);
  const goals = typeof p.goals === "number" ? p.goals : (typeof p.g === "number" ? p.g : (s && typeof s.g === "number" ? s.g : undefined));
  const clubId = String(p.clubId ?? p.c ?? "").trim() || undefined;
  const clubName = String(p.clubName ?? "").trim() || undefined;
  return {
    id,
    name,
    firstName,
    lastName,
    position,
    quotation,
    average,
    matchs,
    goals,
    clubId,
    clubName,
  };
}

export class MpgClient {
  private token: string | null = null;
  private userId: string | null = null;

  /**
   * Connexion : essaie d'abord "simple", puis OIDC si 403 (comptes après fév 2025)
   */
  async signIn(login: string, password: string): Promise<UserSignIn> {
    // 1. Essai auth simple (comptes avant fév 2025)
    const res = await fetch(`${MPG_API_URL}/user/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login,
        password,
        language: "fr-FR",
      }),
    });

    if (res.ok) {
      const data: UserSignIn = await res.json();
      this.token = data.token;
      this.userId = data.userId;
      return data;
    }

    // 2. Si 403, essai OIDC (comptes après fév 2025)
    if (res.status === 403) {
      try {
        const data = await signInOidc(login, password);
        this.token = data.token;
        this.userId = data.userId;
        return data;
      } catch (oidcErr) {
        const msg = oidcErr instanceof Error ? oidcErr.message : "Erreur OIDC";
        throw new Error(msg);
      }
    }

    const text = await res.text();
    throw new Error(`MPG Auth failed: ${res.status} - ${text}`);
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

  /**
   * Pool de joueurs du championnat (stats, noms, positions)
   * championshipId: 1=L1, 2=PL, 3=Liga, 4=L2, 5=Serie A (ou "LIGUE_1", "1", etc.)
   * L'API peut renvoyer des champs abrégés (f, n, p, q, a, etc.) - on les normalise
   */
  async getPoolPlayers(championshipId: number | string): Promise<{ poolPlayers?: Array<{ id?: string; name?: string; firstName?: string; lastName?: string; position?: string; quotation?: number; average?: number; matchs?: number; goals?: number; clubId?: string; clubName?: string }> }> {
    const id = normalizeChampionshipId(championshipId);
    const res = await fetch(`${MPG_API_URL}/championship-players-pool/${id}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`Pool failed: ${res.status}`);
    const raw = await res.json();
    const list = raw?.poolPlayers ?? raw?.players ?? raw?.p ?? [];
    const poolPlayers = (Array.isArray(list) ? list : []).map((p: Record<string, unknown>) =>
      normalizePoolPlayer(p)
    );
    return { poolPlayers };
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
