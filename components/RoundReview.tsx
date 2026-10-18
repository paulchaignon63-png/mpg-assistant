"use client";

import { useEffect, useState } from "react";
import type { SavedPrediction } from "@/lib/manual-league";
import { formatFormation } from "@/lib/engine/mpg-rules";
import { shortName } from "@/lib/names";

export interface ReviewPlayer {
  id: string;
  name: string;
  club: string;
  position: "G" | "D" | "M" | "A";
  state: "done" | "live" | "upcoming" | "none";
  kickoff: number | null;
  score: string | null;
  opponent?: string;
  note: number | null;
  goals: number;
  started: boolean;
}

export interface ReviewData {
  round: number;
  complete: boolean;
  progress: number;
  total: number;
  rotaldo: number;
  best: { total: number; formation: number; ids: string[] };
  players: ReviewPlayer[];
}

/** Charge les résultats réels d'une journée pour un pronostic, avec rafraîchissement optionnel. */
export function useReview(championshipId: string | undefined, prediction: SavedPrediction | undefined, refreshMs?: number) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!championshipId || !prediction) return;
    let alive = true;
    const load = () =>
      fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ championshipId, round: prediction.round, starters: prediction.starters, bench: prediction.bench }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.error) setError(d.error);
          else setData(d);
        })
        .catch(() => alive && setError("Résultats indisponibles."));
    load();
    const t = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [championshipId, prediction, refreshMs]);
  return { data, error };
}

/** Tableau joueur par joueur : attendu vs réel. */
export function ReviewTable({ prediction, data, live }: { prediction: SavedPrediction; data: ReviewData; live?: boolean }) {
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const rows = [...prediction.starters, ...prediction.bench].map((id, i) => ({
    id,
    starter: i < prediction.starters.length,
    pred: prediction.players[id],
    real: byId.get(id),
  }));
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-card">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        <span>Joueur</span>
        <span className="w-12 text-right">Attendu</span>
        <span className="w-12 text-right">{live ? "Direct" : "Réel"}</span>
      </div>
      {rows.map(({ id, starter, pred, real }) => {
        const note = real?.note;
        const delta = note != null && note > 0 && pred ? note - pred.noteMean : null;
        return (
          <div key={id} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 ${starter ? "" : "opacity-70"}`}>
            <span className="min-w-0">
              <span className="block truncate text-sm text-fg">
                {shortName(pred?.name ?? real?.name)}
                {!starter && <span className="ml-1 text-[10px] text-subtle">banc</span>}
                {real && real.goals > 0 && <span className="ml-1">{"⚽".repeat(Math.min(3, real.goals))}</span>}
              </span>
              <span className="block truncate text-[11px] text-subtle">
                {real?.opponent ? `vs ${real.opponent}` : ""}
                {real?.score ? ` · ${real.score}` : ""}
                {real?.state === "upcoming" && real.kickoff
                  ? ` · ${new Date(real.kickoff * 1000).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
                  : ""}
                {real?.state === "live" ? " · en cours" : ""}
              </span>
            </span>
            <span className="w-12 text-right text-sm text-muted tabular-nums">{pred ? pred.noteMean.toFixed(1) : "–"}</span>
            <span className="w-12 text-right text-sm font-semibold tabular-nums">
              {note == null ? (
                <span className="text-subtle">…</span>
              ) : note === 0 ? (
                <span className="text-danger">absent</span>
              ) : (
                <span className={delta != null && delta >= 0 ? "text-accent" : "text-danger"}>{note.toFixed(1)}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function reviewVerdict(prediction: SavedPrediction, data: ReviewData): { luck: number; choices: number; text: string } {
  const luck = data.total - prediction.teamMean;
  const choices = data.best.total - data.total;
  const luckText = luck >= 2 ? "un peu de chance" : luck <= -2 ? "de la malchance" : "un résultat conforme aux attentes";
  const choiceText =
    choices <= 1.5
      ? "La compo était quasiment la meilleure possible."
      : `Le meilleur 11 possible (${formatFormation(data.best.formation)}) aurait fait ${choices.toFixed(1)} pts de plus.`;
  return { luck, choices, text: `Tu as eu ${luckText} (${luck >= 0 ? "+" : ""}${luck.toFixed(1)} pts par rapport au pronostic). ${choiceText}` };
}
