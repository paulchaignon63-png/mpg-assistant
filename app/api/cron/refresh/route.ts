/**
 * GET /api/cron/refresh — tâche planifiée (toutes les heures idéalement).
 * Protégée par CRON_SECRET (en-tête Authorization: Bearer <secret>).
 *
 * Pour chaque championnat :
 *  1. recharge les données (MPGStats, compos probables, cotes) ;
 *  2. fige les pronostics du moteur et des sources de compos avant la
 *     journée, puis, une fois la journée jouée, mesure leur précision
 *     (page Précision, poids des sources) ;
 *  3. envoie les alertes push des ligues abonnées : compo prête la veille,
 *     titulaire sur le banc (compo officielle), blessure ou suspension d'un
 *     titulaire, titularisation qui bouge de plus de 15 points.
 */
import { NextResponse } from "next/server";
import { getRoundData, recommend } from "@/lib/engine/recommend";
import { projectPlayers, roundContext } from "@/lib/engine/project";
import { getSupportedChampionships } from "@/lib/championships";
import { getStore } from "@/lib/store";
import { predictionKey, scoreLineupPredictions } from "@/lib/sources/lineups";
import { pushEnabled, sendPush, type PushRecord } from "@/lib/push";
import { shortName } from "@/lib/names";
import type { RoundPrecision } from "@/lib/precision";

export const maxDuration = 300;

interface AlertState {
  reminder: boolean;
  starters: string[];
  status: Record<string, string>;
  pStart: Record<string, number>;
  benchedSent: string[];
}


function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Fige les prévisions de tous les joueurs pour la journée à venir. */
async function freezePredictions(championshipId: string) {
  const data = await getRoundData(championshipId);
  if (!data) return null;
  const { snapshot, ctx, round } = data;
  const store = getStore();
  const players = snapshot.players.filter((p) => p.clubId != null && ctx.fixtureByClub.has(p.clubId));
  const proj = projectPlayers(snapshot, ctx, players, { lineups: data.lineups.signals, midweek: data.midweek });
  const frozen: Record<string, [number, number, number]> = {};
  for (const p of proj) frozen[p.id] = [Math.round(p.noteMean * 100) / 100, Math.round(p.pStart * 1000) / 1000, Math.round(p.features.seasonNote * 100) / 100];
  // Seulement avant le premier coup d'envoi : ensuite, on garde la dernière version.
  if (Date.now() / 1000 < ctx.firstKickoff) {
    await store.set(`pred:${championshipId}:${snapshot.currentSeasonId}:${round}`, frozen);
    for (const pred of data.lineups.predictions) {
      await store.set(predictionKey(championshipId, snapshot.currentSeasonId, round, pred.source), pred);
    }
  }
  return data;
}

/** Mesure la précision des journées terminées qui ne l'ont pas encore été. */
async function scoreFinishedRounds(championshipId: string) {
  const data = await getRoundData(championshipId);
  if (!data) return;
  const { snapshot } = data;
  const store = getStore();
  const seasonId = snapshot.currentSeasonId;
  const history = (await store.get<RoundPrecision[]>(`precision:${championshipId}`)) ?? [];
  for (const round of [snapshot.lastPlayedRound, snapshot.lastPlayedRound - 1].filter((r) => r > 0)) {
    if (history.some((h) => h.seasonId === seasonId && h.round === round)) continue;
    const frozen = await store.get<Record<string, [number, number, number]>>(`pred:${championshipId}:${seasonId}:${round}`);
    if (!frozen) continue;
    // La journée doit être notée pour la plupart des matchs.
    const ctx = roundContext(snapshot, seasonId, round);
    const rated = [...ctx.eventIds].filter((e) => snapshot.ratedEventIds.has(e)).length;
    if (rated < ctx.eventIds.size * 0.9) continue;
    let mae = 0;
    let base = 0;
    let nRated = 0;
    let brier = 0;
    let brierBase = 0;
    let n = 0;
    for (const p of snapshot.players) {
      const f = frozen[p.id];
      if (!f) continue;
      const m = p.matches.find((x) => x.seasonId === seasonId && x.round === round);
      const started = m?.started ? 1 : 0;
      brier += (f[1] - started) ** 2;
      brierBase += (0.5 - started) ** 2;
      n++;
      if (m && m.note > 0) {
        mae += Math.abs(f[0] - m.note);
        base += Math.abs(f[2] - m.note);
        nRated++;
      }
    }
    if (nRated === 0) continue;
    history.push({
      seasonId,
      round,
      players: nRated,
      noteMae: mae / nRated,
      baselineMae: base / nRated,
      startBrier: brier / n,
      baselineBrier: brierBase / n,
      scoredAt: new Date().toISOString(),
    });
    await scoreLineupPredictions(snapshot, seasonId, round);
  }
  await store.set(`precision:${championshipId}`, history.slice(-60));
}

async function sendAlerts(): Promise<number> {
  if (!pushEnabled()) return 0;
  const store = getStore();
  const subs = await store.list<PushRecord>("push:");
  let sent = 0;
  for (const { key, value: record } of subs) {
    for (const league of Object.values(record.leagues)) {
      const r = await recommend({ championshipId: league.championshipId, playerIds: league.playerIds, mode: league.mode, sims: 600 });
      if ("error" in r) continue;
      const stateKey = `alert:${key}:${league.id}:${r.round}`;
      const prev = await store.get<AlertState>(stateKey);
      const starters = r.players.filter((p) => p.role === "starter");
      const state: AlertState = {
        reminder: prev?.reminder ?? false,
        starters: starters.map((p) => p.id),
        status: Object.fromEntries(r.players.map((p) => [p.id, p.status])),
        pStart: Object.fromEntries(r.players.map((p) => [p.id, p.pStart])),
        benchedSent: prev?.benchedSent ?? [],
      };
      const url = `/ligue/${league.id}/onze`;
      const hoursToKickoff = (r.firstKickoff - Date.now() / 1000) / 3600;
      const messages: Array<{ title: string; body: string; tag: string }> = [];

      // 1. La veille : la compo est prête.
      if (!state.reminder && hoursToKickoff > 0 && hoursToKickoff <= 26) {
        messages.push({ title: `${league.name} · J${r.round}`, body: `Ta compo est prête : ${r.summary}`, tag: `ready-${r.round}` });
        state.reminder = true;
      }

      if (prev) {
        for (const id of prev.starters) {
          const p = r.players.find((x) => x.id === id);
          if (!p) continue;
          const name = shortName(p.name);
          // 2. Compo officielle : un de tes titulaires sur le banc ou absent.
          const confirmedOut = p.signals.includes("compo officielle") && p.pStart < 0.05;
          if (confirmedOut && !state.benchedSent.includes(id)) {
            const sub = r.players.find((x) => x.role === "starter" && !prev.starters.includes(x.id) && x.position === p.position);
            messages.push({
              title: `${name} ne débute pas`,
              body: sub ? `Compo officielle : fais entrer ${shortName(sub.name)} à sa place.` : "Compo officielle : revois ta compo.",
              tag: `bench-${id}`,
            });
            state.benchedSent.push(id);
            continue;
          }
          // 3. Blessure, suspension, hors groupe.
          const was = prev.status[id];
          if (was === "ok" && ["injured", "suspended", "out"].includes(p.status)) {
            messages.push({ title: `${name} forfait`, body: `${p.statusLabel ?? "Indisponible"} : ta compo a été recalculée.`, tag: `status-${id}` });
            continue;
          }
          // 4. Titularisation qui bouge nettement.
          const before = prev.pStart[id];
          if (before != null && Math.abs(p.pStart - before) >= 0.15) {
            messages.push({
              title: `${name} : titulaire à ${Math.round(p.pStart * 100)} %`,
              body: `Contre ${Math.round(before * 100)} % avant. ${p.pStart < before ? "Pense à ton banc." : "Bonne nouvelle pour ta compo."}`,
              tag: `pstart-${id}`,
            });
          }
        }
      }

      for (const m of messages.slice(0, 3)) {
        if (await sendPush(key, record, { ...m, url })) sent++;
      }
      await store.set(stateKey, state);
    }
  }
  return sent;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const report: Record<string, unknown> = {};
  for (const c of getSupportedChampionships()) {
    try {
      const data = await freezePredictions(c.id);
      await scoreFinishedRounds(c.id);
      report[c.id] = data ? { round: data.round, lineupSources: data.lineups.sources } : "indisponible";
    } catch (e) {
      report[c.id] = `erreur : ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const alerts = await sendAlerts().catch(() => -1);
  return NextResponse.json({ ok: true, alerts, championships: report, at: new Date().toISOString() });
}
