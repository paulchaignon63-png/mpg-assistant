"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLeague } from "@/lib/client/use-league";
import { shortName } from "@/lib/names";
import { formatFormation } from "@/lib/engine/mpg-rules";

/** Bonus MPG (codes de l'API, cf. mpg-coach-bot) et quand les jouer. */
const BONUSES: Array<{ code: string; name: string; effect: string; when: "weak" | "strong" | "opponent" }> = [
  { code: "boostOnePlayer", name: "UberEats", effect: "Booste la note d'un de tes joueurs.", when: "strong" },
  { code: "boostAllPlayers", name: "Zahia", effect: "Booste la note de toute ton équipe.", when: "weak" },
  { code: "removeGoal", name: "Valise à Nanard", effect: "Annule un but adverse.", when: "opponent" },
  { code: "nerfGoalkeeper", name: "Suarez", effect: "Affaiblit le gardien adverse.", when: "opponent" },
  { code: "nerfAllPlayers", name: "Cheat Code 18-26", effect: "−0,5 sur chaque joueur de champ adverse (se retourne contre toi si vous le jouez tous les deux).", when: "opponent" },
  { code: "blockTacticalSubs", name: "Tonton Pat'", effect: "Bloque les remplacements tactiques adverses.", when: "opponent" },
  { code: "mirror", name: "Miroir", effect: "Renvoie le bonus de l'adversaire.", when: "opponent" },
  { code: "fourStrikers", name: "4 attaquants", effect: "Permet d'aligner quatre attaquants.", when: "strong" },
];

interface PlannerRound {
  round: number;
  kickoff: number;
  mean: number;
  p10: number;
  p90: number;
  formation: number;
  easyFixtures: number;
  bestPlayer: { id: string; name: string; value: number } | null;
}

export default function BonusPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [league, update] = useLeague(leagueId);
  const [rounds, setRounds] = useState<PlannerRound[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const key = league ? `${league.championshipId}:${league.playerIds.join(",")}` : null;
  useEffect(() => {
    if (!key || !league || league.playerIds.length === 0) return;
    let alive = true;
    fetch("/api/planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ championshipId: league.championshipId, playerIds: league.playerIds, rounds: 6 }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRounds(d.rounds ?? []);
        setRemaining(d.remainingRounds ?? null);
      })
      .catch(() => alive && setMessage("Calendrier indisponible."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const strong = useMemo(() => (rounds?.length ? [...rounds].sort((a, b) => b.mean - a.mean)[0] : null), [rounds]);
  const weak = useMemo(() => (rounds?.length ? [...rounds].sort((a, b) => a.mean - b.mean)[0] : null), [rounds]);
  const totalBonuses = Object.values(league?.bonuses ?? {}).reduce((a, b) => a + b, 0);

  async function importFromMpg() {
    if (!league?.mpg) return;
    setMessage(null);
    const res = await fetch(`/api/mpg/import?teamId=${encodeURIComponent(league.mpg.teamId)}&championshipId=${league.championshipId}`);
    const d = await res.json();
    if (!res.ok) {
      setMessage(d.error ?? "Import impossible.");
      return;
    }
    update({ bonuses: d.bonuses ?? {} });
    setMessage("Bonus mis à jour depuis MPG.");
  }

  if (league === null) return null;
  const max = rounds?.length ? Math.max(...rounds.map((r) => r.p90)) : 1;
  const min = rounds?.length ? Math.min(...rounds.map((r) => r.p10)) : 0;

  return (
    <div className="min-h-screen px-4 pb-16 pt-6">
      <div className="mx-auto max-w-md space-y-5">
        <Link href={`/ligue/${leagueId}`} className="inline-block text-sm text-muted hover:text-fg">
          ← {league?.name ?? "Retour"}
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-fg">Tes bonus</h1>
          <p className="text-sm text-muted">Ta force attendue sur les prochaines journées, pour jouer chaque bonus au bon moment.</p>
        </div>

        {/* Prochaines journées */}
        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-fg">Prochaines journées</h2>
          {!rounds && <div className="h-40 animate-pulse rounded bg-bg" />}
          {rounds && rounds.length === 0 && <p className="text-sm text-muted">Pas de journée à venir.</p>}
          {rounds && rounds.length > 0 && (
            <div className="space-y-2">
              {rounds.map((r) => {
                const left = ((r.p10 - min) / Math.max(1, max - min)) * 100;
                const width = ((r.p90 - r.p10) / Math.max(1, max - min)) * 100;
                const mid = ((r.mean - min) / Math.max(1, max - min)) * 100;
                return (
                  <div key={r.round} className="grid grid-cols-[2.5rem_1fr_3rem] items-center gap-2">
                    <span className="text-sm font-semibold text-fg">J{r.round}</span>
                    <div className="relative h-5 rounded bg-bg" title={`Entre ${r.p10.toFixed(0)} et ${r.p90.toFixed(0)} pts`}>
                      <div className="absolute top-1.5 h-2 rounded bg-emerald-500/30" style={{ left: `${left}%`, width: `${width}%` }} />
                      <div className="absolute top-0.5 h-4 w-1 rounded bg-emerald-500" style={{ left: `calc(${mid}% - 2px)` }} />
                    </div>
                    <span className="text-right text-sm tabular-nums text-fg">{r.mean.toFixed(1)}</span>
                    <span />
                    <span className="col-span-2 -mt-1 text-[11px] text-subtle">
                      {formatFormation(r.formation)} · {r.easyFixtures} match{r.easyFixtures > 1 ? "s" : ""} facile{r.easyFixtures > 1 ? "s" : ""}
                      {r.bestPlayer ? ` · meilleur : ${shortName(r.bestPlayer.name)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compteurs */}
        <div className="rounded-xl border border-line bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-fg">Bonus restants</h2>
            {league?.mpg && (
              <button onClick={importFromMpg} className="text-xs text-accent">
                Récupérer depuis MPG
              </button>
            )}
          </div>
          {remaining != null && totalBonuses > 0 && totalBonuses >= remaining * 0.5 && (
            <p className="mb-3 rounded-lg bg-amber-500/10 p-2 text-sm text-warn">
              Il te reste {totalBonuses} bonus pour {remaining} journées : pense à les jouer avant la fin de la saison.
            </p>
          )}
          <div className="space-y-3">
            {BONUSES.map((b) => {
              const n = league?.bonuses[b.code] ?? 0;
              const advice =
                b.when === "opponent"
                  ? "Garde-le pour l'adversaire le plus fort de ta ligue."
                  : b.when === "weak" && weak
                    ? `Plutôt en J${weak.round}, ta journée la plus faible (${weak.mean.toFixed(1)} pts attendus).`
                    : strong
                      ? `Plutôt en J${strong.round}${b.code === "boostOnePlayer" && strong.bestPlayer ? ` sur ${shortName(strong.bestPlayer.name)}` : ""}, ta journée la plus forte.`
                      : "";
              return (
                <div key={b.code} className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{b.name}</p>
                    <p className="text-xs text-muted">{b.effect}</p>
                    {n > 0 && advice && <p className="mt-0.5 text-xs text-accent">{advice}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      aria-label={`Retirer un ${b.name}`}
                      onClick={() => update({ bonuses: { ...league!.bonuses, [b.code]: Math.max(0, n - 1) } })}
                      className="h-7 w-7 rounded-full bg-chip text-fg"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm tabular-nums text-fg">{n}</span>
                    <button
                      aria-label={`Ajouter un ${b.name}`}
                      onClick={() => update({ bonuses: { ...league!.bonuses, [b.code]: n + 1 } })}
                      className="h-7 w-7 rounded-full bg-chip text-fg"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {message && <p className="mt-3 text-sm text-muted">{message}</p>}
        </div>
        <p className="text-[11px] text-subtle">
          Les effets exacts des bonus dépendent des règles de ta ligue MPG ; vérifie-les dans l&apos;app MPG avant de les jouer.
        </p>
      </div>
    </div>
  );
}
