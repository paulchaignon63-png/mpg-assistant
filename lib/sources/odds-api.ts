/**
 * Cotes « buteur à tout moment » via The Odds API (clé ODDS_API_KEY).
 *
 * Les cotes 1-N-2 viennent déjà gratuitement de MPGStats ; cette source
 * n'ajoute que la probabilité de marquer par joueur. Le quota gratuit est
 * serré (500 crédits / mois) : réponse gardée 12 h en cache, et seuls les
 * matchs des prochains jours sont demandés.
 */

import type { ChampionshipSnapshot } from "../data/mpgstats";
import { createClubMatcher } from "../clubs";
import { resolveEntriesToPlayers } from "../player-matching";

const SPORT_KEYS: Record<string, string> = {
  "1": "soccer_france_ligue_one",
  "4": "soccer_france_ligue_two",
  "2": "soccer_epl",
  "3": "soccer_spain_la_liga",
  "5": "soccer_italy_serie_a",
};

const BASE = "https://api.the-odds-api.com/v4";

/** Marge moyenne des bookmakers sur ce marché, retirée des probabilités. */
const SCORER_MARGIN = 1.12;

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface EventOdds {
  bookmakers?: Array<{
    markets?: Array<{ key: string; outcomes?: Array<{ name: string; description?: string; price: number }> }>;
  }>;
}

export function oddsApiEnabled(): boolean {
  return !!process.env.ODDS_API_KEY;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 43200 } } as RequestInit);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Probabilité de marquer par id de joueur MPGStats. */
export async function getScorerOdds(snapshot: ChampionshipSnapshot, untilKickoff: number): Promise<Map<string, number>> {
  const key = process.env.ODDS_API_KEY;
  const sport = SPORT_KEYS[snapshot.championshipId];
  const out = new Map<string, number>();
  if (!key || !sport) return out;

  const events = await getJson<OddsEvent[]>(`${BASE}/sports/${sport}/events?apiKey=${key}`);
  if (!events?.length) return out;

  const clubNames = snapshot.currentClubIds.map((id) => snapshot.clubs.get(id)!.name);
  const matchClub = createClubMatcher(clubNames);
  const idByName = new Map(snapshot.currentClubIds.map((id) => [snapshot.clubs.get(id)!.name, id]));
  const horizon = (untilKickoff + 4 * 86400) * 1000;

  for (const ev of events) {
    if (new Date(ev.commence_time).getTime() > horizon) continue;
    const clubIds = [matchClub(ev.home_team), matchClub(ev.away_team)]
      .map((n) => (n ? idByName.get(n) : undefined))
      .filter((x): x is number => x != null);
    if (clubIds.length === 0) continue;
    const odds = await getJson<EventOdds>(
      `${BASE}/sports/${sport}/events/${ev.id}/odds?apiKey=${key}&regions=us,eu&markets=player_goal_scorer_anytime&oddsFormat=decimal`
    );
    const prices = new Map<string, number[]>();
    for (const b of odds?.bookmakers ?? []) {
      for (const m of b.markets ?? []) {
        if (m.key !== "player_goal_scorer_anytime") continue;
        for (const o of m.outcomes ?? []) {
          const name = o.description ?? o.name;
          if (!name || !o.price) continue;
          prices.set(name, [...(prices.get(name) ?? []), o.price]);
        }
      }
    }
    if (prices.size === 0) continue;
    const players = snapshot.players.filter((p) => p.clubId != null && clubIds.includes(p.clubId));
    const names = [...prices.keys()];
    const resolved = resolveEntriesToPlayers(
      players.map((p) => ({ name: p.name })),
      names.map((playerName) => ({ playerName }))
    );
    for (const [idx, entry] of resolved) {
      const ps = prices.get(entry.playerName)!;
      const median = [...ps].sort((a, b) => a - b)[Math.floor(ps.length / 2)];
      out.set(players[idx].id, Math.min(0.95, 1 / median / SCORER_MARGIN));
    }
  }
  return out;
}
