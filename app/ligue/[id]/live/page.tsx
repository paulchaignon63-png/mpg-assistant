"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLeague } from "@/lib/client/use-league";
import { ReviewTable, useReview } from "@/components/RoundReview";

/**
 * Journée en direct : les notes arrivent au fil des matchs (MPGStats publie
 * les notes après chaque match). Le total projeté mélange les notes réelles
 * et les notes attendues des matchs à venir. Le simulateur « et si » permet
 * de tester une note pour un joueur pas encore noté.
 */
export default function LivePage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [league] = useLeague(leagueId);
  const prediction = league?.history[0];
  const { data, error } = useReview(league?.championshipId, prediction, 120_000);
  const [whatIf, setWhatIf] = useState<Record<string, number>>({});

  const projection = useMemo(() => {
    if (!prediction || !data) return null;
    const byId = new Map(data.players.map((p) => [p.id, p]));
    // On part du pronostic (remplacements compris) et on corrige joueur par
    // joueur au fil des notes réelles et des hypothèses « et si ».
    let real = 0;
    let projected = prediction.teamMean;
    for (const id of prediction.starters) {
      const p = byId.get(id);
      const expected = prediction.players[id]?.value ?? 5;
      if (whatIf[id] != null) {
        projected += whatIf[id] - expected;
      } else if (p?.note != null && p.note > 0) {
        real += p.note + p.goals;
        projected += p.note + p.goals - expected;
      } else if (p?.note === 0) {
        projected += 4.5 - expected; // un remplaçant entrera (ou Rotaldo)
      }
    }
    return { real, projected };
  }, [prediction, data, whatIf]);

  if (league === null) return null;
  const pending = data?.players.filter((p) => p.state !== "done" && prediction?.starters.includes(p.id)) ?? [];

  return (
    <div className="min-h-screen px-4 pb-16 pt-6">
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/ligue/${leagueId}`} className="inline-block text-sm text-muted hover:text-fg">
          ← {league?.name ?? "Retour"}
        </Link>
        <h1 className="text-2xl font-bold text-fg">En direct{prediction ? ` · J${prediction.round}` : ""}</h1>

        {!prediction && (
          <p className="rounded-xl border border-line bg-card p-4 text-sm text-muted">
            Ouvre ta compo avant la journée : on suivra ensuite tes joueurs ici, note par note.
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        {prediction && data && projection && (
          <>
            <div className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-subtle">Total projeté</div>
                  <div className="text-3xl font-bold text-fg tabular-nums">{projection.projected.toFixed(1)}</div>
                </div>
                <div className="text-right text-sm text-muted tabular-nums">
                  <div>déjà acquis {projection.real.toFixed(1)}</div>
                  <div>pronostic {prediction.teamMean.toFixed(1)}</div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-chip">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.progress * 100}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-subtle">
                {Math.round(data.progress * 100)} % de tes joueurs notés · mise à jour toutes les 2 minutes
              </p>
            </div>

            {pending.length > 0 && (
              <div className="rounded-xl border border-line bg-card p-4">
                <h2 className="text-sm font-bold text-fg">Et si…</h2>
                <p className="mb-3 text-xs text-subtle">Teste la note d&apos;un joueur qui n&apos;a pas encore joué.</p>
                <div className="space-y-3">
                  {pending.map((p) => (
                    <div key={p.id}>
                      <label htmlFor={`wi-${p.id}`} className="flex justify-between text-sm text-fg">
                        <span>{p.name}</span>
                        <span className="tabular-nums">{whatIf[p.id] != null ? whatIf[p.id].toFixed(1) : "—"}</span>
                      </label>
                      <input
                        id={`wi-${p.id}`}
                        type="range"
                        min={2}
                        max={9}
                        step={0.5}
                        value={whatIf[p.id] ?? prediction.players[p.id]?.noteMean ?? 5}
                        onChange={(e) => setWhatIf({ ...whatIf, [p.id]: Number(e.target.value) })}
                        className="w-full accent-emerald-500"
                      />
                    </div>
                  ))}
                </div>
                {Object.keys(whatIf).length > 0 && (
                  <button onClick={() => setWhatIf({})} className="mt-2 text-xs text-accent underline">
                    Revenir au pronostic
                  </button>
                )}
              </div>
            )}

            <ReviewTable prediction={prediction} data={data} live />
          </>
        )}
      </div>
    </div>
  );
}
