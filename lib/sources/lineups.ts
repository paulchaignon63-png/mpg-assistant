/**
 * Compos probables agrégées, pondérées par la fiabilité mesurée de chaque
 * source (à la manière de Fantacalcio-Online).
 *
 * Sources :
 *  - RotoWire (compos attendues puis officielles, L1 / PL / Liga / Serie A).
 *
 * Après chaque journée, le cron compare la compo annoncée par chaque source
 * aux vrais titulaires (MPGStats) et met à jour son taux de réussite, qui
 * devient son poids.
 */

import type { ChampionshipSnapshot, Player } from "../data/mpgstats";
import { createClubMatcher } from "../clubs";
import { resolveEntriesToPlayers } from "../player-matching";
import { getStore } from "../store";
import type { LineupSignal, RoundContext } from "../engine/project";
import { fetchRotowireLineups, rotowireSupported, type TeamLineup } from "./rotowire";

/** Probabilité qu'un joueur annoncé titulaire (compo non officielle) le soit vraiment. */
const LISTED_START_PROB = 0.88;
/** Probabilité qu'un joueur NON annoncé soit quand même titulaire. */
const UNLISTED_START_PROB = 0.06;
const DEFAULT_WEIGHT = 0.65;

export interface SourceAccuracy {
  hits: number;
  total: number;
  rounds: number;
  updatedAt: string;
}

/** Prédiction d'une source pour une journée : ids des titulaires annoncés par club. */
export interface SourcePrediction {
  source: string;
  confirmedClubs: number[];
  startersByClub: Record<string, string[]>;
  savedAt: string;
}

export function accuracyKey(source: string, championshipId: string): string {
  return `lineup-acc:${source}:${championshipId}`;
}

export function predictionKey(championshipId: string, seasonId: number, round: number, source: string): string {
  return `lineup-pred:${championshipId}:${seasonId}:${round}:${source}`;
}

/** Poids d'une source d'après sa réussite passée. */
export function weightFromAccuracy(acc: SourceAccuracy | null): number {
  if (!acc || acc.total < 50) return DEFAULT_WEIGHT;
  const rate = acc.hits / acc.total;
  return Math.max(0.3, Math.min(0.9, (rate - 0.5) * 1.8));
}

/** Rapproche une compo d'équipe (noms libres) des joueurs MPGStats du club. */
function mapTeam(team: TeamLineup, clubPlayers: Player[]): { starters: Set<string>; out: Set<string>; doubtful: Set<string> } {
  const refs = clubPlayers.map((p) => ({ name: p.name }));
  const idOf = (i: number) => clubPlayers[i].id;
  const starters = new Set([...resolveEntriesToPlayers(refs, team.starters.map((playerName) => ({ playerName }))).keys()].map(idOf));
  const out = new Set(
    [...resolveEntriesToPlayers(refs, team.absences.filter((a) => a.status === "out").map((a) => ({ playerName: a.name }))).keys()].map(idOf)
  );
  const doubtful = new Set(
    [...resolveEntriesToPlayers(refs, team.absences.filter((a) => a.status === "doubtful").map((a) => ({ playerName: a.name }))).keys()].map(idOf)
  );
  return { starters, out, doubtful };
}

export interface LineupBundle {
  signals: Map<string, LineupSignal>;
  predictions: SourcePrediction[];
  /** Sources disponibles pour ce championnat (pour l'affichage). */
  sources: Array<{ source: string; weight: number; clubs: number; confirmed: number }>;
}

export async function getLineupSignals(snapshot: ChampionshipSnapshot, ctx: RoundContext): Promise<LineupBundle> {
  const store = getStore();
  const champ = snapshot.championshipId;
  const clubIds = [...ctx.fixtureByClub.keys()];
  const playersByClub = new Map<number, Player[]>();
  for (const p of snapshot.players) {
    if (p.clubId == null || !ctx.fixtureByClub.has(p.clubId)) continue;
    playersByClub.set(p.clubId, [...(playersByClub.get(p.clubId) ?? []), p]);
  }

  // Par joueur : liste des avis (probabilité, poids, source, officielle ?).
  const opinions = new Map<string, Array<{ p: number; w: number; source: string; confirmed: boolean }>>();
  const add = (id: string, o: { p: number; w: number; source: string; confirmed: boolean }) =>
    opinions.set(id, [...(opinions.get(id) ?? []), o]);

  const predictions: SourcePrediction[] = [];
  const sources: LineupBundle["sources"] = [];

  // --- RotoWire
  if (rotowireSupported(champ)) {
    const [matches, acc] = await Promise.all([
      fetchRotowireLineups(champ),
      store.get<SourceAccuracy>(accuracyKey("rotowire", champ)).catch(() => null),
    ]);
    const weight = weightFromAccuracy(acc);
    const matchClub = createClubMatcher(clubIds.map((id) => snapshot.clubs.get(id)!.name));
    const idByName = new Map(clubIds.map((id) => [snapshot.clubs.get(id)!.name, id]));
    const pred: SourcePrediction = { source: "rotowire", confirmedClubs: [], startersByClub: {}, savedAt: new Date().toISOString() };
    for (const m of matches) {
      // La page garde aussi les matchs de la journée précédente : on ne retient
      // une compo que si l'affiche (domicile / extérieur) est bien celle de la
      // journée visée.
      const homeName = matchClub(m.home.team);
      const awayName = matchClub(m.away.team);
      const homeId = homeName ? idByName.get(homeName) : undefined;
      const awayId = awayName ? idByName.get(awayName) : undefined;
      const fixture = homeId != null ? ctx.fixtureByClub.get(homeId) : undefined;
      if (!fixture || fixture.homeId !== homeId || fixture.awayId !== awayId) continue;
      for (const team of [m.home, m.away]) {
        const clubId = team === m.home ? homeId : awayId;
        if (clubId == null) continue;
        const clubPlayers = playersByClub.get(clubId) ?? [];
        const mapped = mapTeam(team, clubPlayers);
        if (mapped.starters.size < 8) continue; // rapprochement trop incomplet
        pred.startersByClub[String(clubId)] = [...mapped.starters];
        if (team.confirmed) pred.confirmedClubs.push(clubId);
        for (const p of clubPlayers) {
          let prob: number;
          if (mapped.out.has(p.id)) prob = 0;
          else if (mapped.starters.has(p.id)) prob = team.confirmed ? 1 : LISTED_START_PROB;
          else if (mapped.doubtful.has(p.id)) prob = 0.25;
          else prob = team.confirmed ? 0 : UNLISTED_START_PROB;
          add(p.id, { p: prob, w: team.confirmed ? 1 : weight, source: "RotoWire", confirmed: team.confirmed });
        }
      }
    }
    predictions.push(pred);
    sources.push({
      source: "RotoWire",
      weight,
      clubs: Object.keys(pred.startersByClub).length,
      confirmed: pred.confirmedClubs.length,
    });
  }

  // --- Agrégation : moyenne pondérée ; une compo officielle l'emporte.
  const signals = new Map<string, LineupSignal>();
  for (const [id, ops] of opinions) {
    const official = ops.find((o) => o.confirmed);
    if (official) {
      signals.set(id, { pStart: official.p, confirmed: true, weight: 1, sources: [official.source] });
      continue;
    }
    const wSum = ops.reduce((a, o) => a + o.w, 0);
    if (wSum <= 0) continue;
    const p = ops.reduce((a, o) => a + o.p * o.w, 0) / wSum;
    // Le poids final croît avec l'accord et le nombre de sources, sans dépasser 0,9.
    const weight = Math.min(0.9, 1 - ops.reduce((a, o) => a * (1 - o.w), 1));
    signals.set(id, { pStart: p, confirmed: false, weight, sources: [...new Set(ops.map((o) => o.source))] });
  }

  return { signals, predictions, sources };
}

/**
 * Après une journée : compare les compos annoncées aux vrais titulaires et
 * met à jour la réussite de chaque source. Renvoie le nombre de joueurs évalués.
 */
export async function scoreLineupPredictions(snapshot: ChampionshipSnapshot, seasonId: number, round: number): Promise<number> {
  const store = getStore();
  const champ = snapshot.championshipId;
  let evaluated = 0;
  for (const source of ["rotowire"]) {
    const key = predictionKey(champ, seasonId, round, source);
    const pred = await store.get<SourcePrediction & { scored?: boolean }>(key);
    if (!pred || pred.scored) continue;
    const startedIds = new Set(
      snapshot.players
        .filter((p) => p.matches.some((m) => m.seasonId === seasonId && m.round === round && m.started))
        .map((p) => p.id)
    );
    let hits = 0;
    let total = 0;
    for (const ids of Object.values(pred.startersByClub)) {
      for (const id of ids) {
        total++;
        if (startedIds.has(id)) hits++;
      }
    }
    if (total === 0) continue;
    const acc = (await store.get<SourceAccuracy>(accuracyKey(source, champ))) ?? { hits: 0, total: 0, rounds: 0, updatedAt: "" };
    await store.set(accuracyKey(source, champ), {
      hits: acc.hits + hits,
      total: acc.total + total,
      rounds: acc.rounds + 1,
      updatedAt: new Date().toISOString(),
    });
    await store.set(key, { ...pred, scored: true });
    evaluated += total;
  }
  return evaluated;
}
