/**
 * Lien avec un compte MPG (API non officielle, cf. mpg-coach-bot) :
 * ligues du compte, import de l'effectif et des bonus, effectif de
 * l'adversaire de la journée, et envoi de la compo.
 *
 * Le jeton MPG est gardé dans un cookie httpOnly (jamais lisible par le
 * JavaScript de la page) et n'est stocké nulle part côté serveur.
 */

import { cookies } from "next/headers";
import { createMpgClient } from "./mpg-client";
import { mpgBrowserHeaders } from "./mpg-headers";
import { loadChampionship, type ChampionshipSnapshot } from "./data/mpgstats";
import { resolveEntriesToPlayers } from "./player-matching";
import { FORMATIONS, type Pos } from "./engine/mpg-rules";

const MPG_API_URL = "https://api.mpg.football";
export const MPG_COOKIE = "mpg_session";

export async function readMpgSession(): Promise<{ token: string; userId: string } | null> {
  const raw = (await cookies()).get(MPG_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return v?.token ? v : null;
  } catch {
    return null;
  }
}

export function encodeSession(token: string, userId: string): string {
  return Buffer.from(JSON.stringify({ token, userId })).toString("base64url");
}

async function mpgFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MPG_API_URL}${path}`, {
    ...init,
    headers: mpgBrowserHeaders({ Authorization: token, "Content-Type": "application/json" }),
    cache: "no-store",
  });
  if (res.status === 401) throw new MpgAuthError();
  if (!res.ok) throw new Error(`MPG ${path} : HTTP ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export class MpgAuthError extends Error {
  constructor() {
    super("Session MPG expirée, reconnecte-toi.");
  }
}

// --- Ligues -----------------------------------------------------------------

export interface MpgLeagueSummary {
  name: string;
  divisionId: string;
  teamId?: string;
  championshipId: string;
  status?: string;
}

export async function listMpgLeagues(token: string, userId: string): Promise<MpgLeagueSummary[]> {
  const client = createMpgClient();
  client.setToken(token, userId);
  const dash = await client.getDashboard();
  const items = (dash.leaguesDivisionsItems ?? []) as unknown as Array<Record<string, unknown>>;
  return Promise.all(
    items.map(async (l) => {
      const divisionId = String(l.divisionId ?? l.leagueId ?? "");
      let teamId = typeof l.teamId === "string" ? l.teamId : undefined;
      if (!teamId && divisionId) {
        try {
          const div = await client.getDivision(divisionId);
          const teams = (div.usersTeams ?? {}) as Record<string, string>;
          const bare = userId.replace(/^user_/, "");
          teamId = teams[userId] ?? teams[`user_${bare}`] ?? teams[bare];
        } catch {
          /* ligue inaccessible : on la liste quand même */
        }
      }
      return {
        name: String(l.name ?? "Ligue MPG"),
        divisionId,
        teamId,
        championshipId: String(l.championshipId ?? "1"),
        status: (l.status as { status?: string } | undefined)?.status,
      };
    })
  );
}

// --- Correspondance joueurs MPG ↔ MPGStats ------------------------------------

interface PoolPlayer {
  id?: string;
  firstName?: string;
  lastName?: string;
  clubId?: string;
}

function bareId(id: string): string {
  return id.replace(/^mpg_(championship_)?player_/, "");
}

/**
 * Identifiants MPG → identifiants de l'app. MPGStats reprend les numéros de
 * joueurs MPG : on essaie d'abord l'égalité des numéros, puis le nom.
 */
export function mapMpgPlayers(
  snapshot: ChampionshipSnapshot,
  mpgIds: string[],
  pool: PoolPlayer[]
): { mapping: Map<string, string>; unmatched: string[] } {
  const byNum = new Map(snapshot.players.map((p) => [String(p.mpgStatsId), p.id]));
  const poolById = new Map(pool.map((p) => [p.id ?? "", p]));
  const mapping = new Map<string, string>();
  const unmatched: string[] = [];
  const refs = snapshot.players.map((p) => ({ name: p.name }));
  for (const mpgId of mpgIds) {
    const direct = byNum.get(bareId(mpgId));
    if (direct) {
      mapping.set(mpgId, direct);
      continue;
    }
    const pp = poolById.get(mpgId);
    const name = [pp?.firstName, pp?.lastName].filter(Boolean).join(" ").trim();
    if (!name) {
      unmatched.push(mpgId);
      continue;
    }
    const hit = [...resolveEntriesToPlayers(refs, [{ playerName: name }]).keys()][0];
    if (hit != null) mapping.set(mpgId, snapshot.players[hit].id);
    else unmatched.push(name);
  }
  return { mapping, unmatched };
}

async function teamSquadIds(token: string, teamId: string): Promise<{ ids: string[]; bonuses: Record<string, number>; name: string }> {
  const team = await mpgFetch<{ name?: string; squad?: Record<string, unknown>; bonuses?: Record<string, number> }>(
    token,
    `/team/${teamId.startsWith("mpg_team_") ? teamId : `mpg_team_${teamId}`}`
  );
  return { ids: Object.keys(team.squad ?? {}), bonuses: team.bonuses ?? {}, name: team.name ?? "" };
}

async function poolOf(token: string, championshipId: string): Promise<PoolPlayer[]> {
  const client = createMpgClient();
  client.setToken(token, "");
  return (await client.getPoolPlayers(championshipId)).poolPlayers ?? [];
}

export async function importMpgTeam(token: string, teamId: string, championshipId: string) {
  const [snapshot, squad, pool] = await Promise.all([
    loadChampionship(championshipId),
    teamSquadIds(token, teamId),
    poolOf(token, championshipId).catch(() => []),
  ]);
  if (!snapshot) throw new Error("Données du championnat indisponibles.");
  const { mapping, unmatched } = mapMpgPlayers(snapshot, squad.ids, pool);
  return { name: squad.name, playerIds: [...new Set(mapping.values())], unmatched, bonuses: squad.bonuses };
}

// --- Adversaire de la journée ---------------------------------------------------

interface CoachResponse {
  divisionMatch?: { home?: { teamId?: string }; away?: { teamId?: string } };
  matchTeamFormation?: { id?: string; availableBonuses?: Record<string, number> };
  nextGameWeek?: { gameWeekNumber?: number };
}

async function coachOf(token: string, divisionId: string): Promise<CoachResponse> {
  const id = divisionId.startsWith("mpg_division_") ? divisionId : `mpg_division_${divisionId}`;
  return mpgFetch<CoachResponse>(token, `/division/${id}/coach`);
}

export async function mpgOpponent(token: string, divisionId: string, teamId: string, championshipId: string) {
  const coach = await coachOf(token, divisionId);
  const home = coach.divisionMatch?.home?.teamId;
  const away = coach.divisionMatch?.away?.teamId;
  const oppTeamId = home && home !== teamId ? home : away && away !== teamId ? away : undefined;
  if (!oppTeamId) return null;
  const imported = await importMpgTeam(token, oppTeamId, championshipId);
  return { ...imported, gameWeek: coach.nextGameWeek?.gameWeekNumber, myBonuses: coach.matchTeamFormation?.availableBonuses ?? {} };
}

// --- Envoi de la compo -----------------------------------------------------------

export interface SubmitPlan {
  formation: number;
  starters: Array<{ id: string; position: Pos }>;
  bench: Array<{ id: string; position: Pos }>;
  captainId?: string | null;
  tacticalSubs?: Array<{ outId: string; inId: string; threshold: number }>;
}

/**
 * Corps attendu par PUT /match-team-formation/{id} (format de mpg-coach-bot) :
 * 1 = gardien, puis défenseurs, milieux, attaquants jusqu'à 11 ;
 * banc 12-13 défenseurs, 14-15 milieux, 16-17 attaquants, 18 gardien.
 */
export function buildFormationBody(plan: SubmitPlan, toMpg: (appId: string) => string | undefined) {
  const f = FORMATIONS[plan.formation];
  if (!f) throw new Error("Formation inconnue");
  const pitch: Record<string, string | null> = {};
  let slot = 1;
  for (const pos of ["G", "D", "M", "A"] as const) {
    const line = plan.starters.filter((p) => p.position === pos);
    for (let i = 0; i < f[pos]; i++) pitch[String(slot++)] = line[i] ? toMpg(line[i].id) ?? null : null;
  }
  const benchSlots: Record<Pos, number[]> = { D: [12, 13], M: [14, 15], A: [16, 17], G: [18] };
  for (const pos of ["D", "M", "A", "G"] as const) {
    const line = plan.bench.filter((p) => p.position === pos);
    benchSlots[pos].forEach((s, i) => {
      pitch[String(s)] = line[i] ? toMpg(line[i].id) ?? null : null;
    });
  }
  const body: Record<string, unknown> = {
    composition: String(plan.formation),
    playersOnPitch: pitch,
    tacticalSubs: (plan.tacticalSubs ?? [])
      .map((t) => ({ rating: t.threshold, subId: toMpg(t.inId), starterId: toMpg(t.outId) }))
      .filter((t) => t.subId && t.starterId),
  };
  const captain = plan.captainId ? toMpg(plan.captainId) : undefined;
  if (captain) body.captain = captain;
  return body;
}

export async function submitMpgLineup(token: string, divisionId: string, teamId: string, championshipId: string, plan: SubmitPlan) {
  const [coach, snapshot, squad, pool] = await Promise.all([
    coachOf(token, divisionId),
    loadChampionship(championshipId),
    teamSquadIds(token, teamId),
    poolOf(token, championshipId).catch(() => []),
  ]);
  const formationId = coach.matchTeamFormation?.id;
  if (!formationId) throw new Error("Aucune compo à envoyer pour cette journée (journée en cours ou terminée ?).");
  if (!snapshot) throw new Error("Données du championnat indisponibles.");
  const { mapping } = mapMpgPlayers(snapshot, squad.ids, pool);
  const reverse = new Map([...mapping].map(([mpg, app]) => [app, mpg]));
  const body = buildFormationBody(plan, (id) => reverse.get(id));
  await mpgFetch(token, `/match-team-formation/${formationId}`, { method: "PUT", body: JSON.stringify(body) });
  return { ok: true, gameWeek: coach.nextGameWeek?.gameWeekNumber };
}
