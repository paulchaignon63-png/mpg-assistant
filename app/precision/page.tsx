"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flag } from "@/components/Flag";
import type { RoundPrecision } from "@/lib/precision";

interface Backtest {
  rounds: number;
  squadsPerRound: number;
  newPoints: number;
  oldPoints: number;
  naivePoints: number;
  newBeatsOld: number;
  noteMae: number;
  baselineMae: number;
  startBrier: number;
  baselineBrier: number;
  holdout?: boolean;
  generatedAt: string;
}

interface ChampPrecision {
  id: string;
  name: string;
  countryCode: string;
  backtest: Backtest | null;
  live: RoundPrecision[];
  rotowire: { hits: number; total: number; rounds: number } | null;
}

function signed(x: number, digits = 1) {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;
}

/**
 * La précision du 11 parfait, en toute transparence : rejeu des journées
 * passées et suivi réel des pronostics, journée après journée.
 */
export default function PrecisionPage() {
  const [data, setData] = useState<{ model: { version: string; trainedAt: string | null; samples: number }; championships: ChampPrecision[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/precision")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Données de précision indisponibles."));
  }, []);

  return (
    <div className="min-h-screen px-4 pb-16 pt-6">
      <div className="mx-auto max-w-md space-y-5">
        <Link href="/" className="inline-block text-sm text-muted hover:text-fg">
          ← Accueil
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-fg">Notre précision</h1>
          <p className="text-sm text-muted">
            Chaque pronostic est figé avant le match puis comparé aux vraies notes. Rien n&apos;est retouché après coup.
          </p>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && <div className="h-48 animate-pulse rounded-xl bg-card" />}

        {data?.championships.map((c) => {
          const b = c.backtest;
          const live = c.live;
          const liveMae = live.length ? live.reduce((a, r) => a + r.noteMae, 0) / live.length : null;
          const liveBase = live.length ? live.reduce((a, r) => a + r.baselineMae, 0) / live.length : null;
          return (
            <section key={c.id} className="rounded-xl border border-line bg-card p-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold text-fg">
                <Flag code={c.countryCode} size={20} /> {c.name}
              </h2>
              {b ? (
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-bg p-2">
                      <div className="text-lg font-bold text-accent tabular-nums">{signed(b.newPoints - b.oldPoints)}</div>
                      <div className="text-[10px] text-subtle">pt/journée vs ancien moteur</div>
                    </div>
                    <div className="rounded-lg bg-bg p-2">
                      <div className="text-lg font-bold text-fg tabular-nums">{signed(b.newPoints - b.naivePoints)}</div>
                      <div className="text-[10px] text-subtle">pt/journée vs choix à la moyenne</div>
                    </div>
                    <div className="rounded-lg bg-bg p-2">
                      <div className="text-lg font-bold text-fg tabular-nums">{Math.round(b.newBeatsOld * 100)} %</div>
                      <div className="text-[10px] text-subtle">duels gagnés vs ancien</div>
                    </div>
                  </div>
                  <p className="text-muted">
                    Erreur moyenne sur la note : <b className="text-fg">{b.noteMae.toFixed(2)}</b> (moyenne de saison du joueur :{" "}
                    {b.baselineMae.toFixed(2)}). Titularisation (score de Brier, plus bas = mieux) : {b.startBrier.toFixed(3)} contre{" "}
                    {b.baselineBrier.toFixed(3)} pour le taux récent.
                  </p>
                  <p className="text-[11px] text-subtle">
                    {b.rounds} journées rejouées × {b.squadsPerRound} effectifs tirés au hasard
                    {b.holdout ? ", modèle appris sur la saison précédente uniquement (test hors échantillon)" : ""}.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">Banc d&apos;essai pas encore lancé pour ce championnat.</p>
              )}

              <div className="mt-4 border-t border-line pt-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Suivi réel de la saison</h3>
                {live.length === 0 ? (
                  <p className="text-sm text-muted">Les premières journées suivies apparaîtront ici.</p>
                ) : (
                  <>
                    <p className="text-sm text-fg">
                      Erreur moyenne {liveMae!.toFixed(2)} sur {live.length} journée{live.length > 1 ? "s" : ""} (référence {liveBase!.toFixed(2)}).
                    </p>
                    <div className="mt-2 flex h-16 items-end gap-1" aria-hidden>
                      {live.map((r) => (
                        <div key={`${r.seasonId}-${r.round}`} className="flex flex-1 flex-col items-center gap-0.5">
                          <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max(8, (1.2 - r.noteMae) * 60)}px` }} title={`J${r.round} : ${r.noteMae.toFixed(2)}`} />
                          <span className="text-[9px] text-subtle">J{r.round}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {c.rotowire && c.rotowire.total > 0 && (
                <p className="mt-3 text-[11px] text-subtle">
                  Compos probables RotoWire : {Math.round((c.rotowire.hits / c.rotowire.total) * 100)} % de titulaires bien annoncés sur{" "}
                  {c.rotowire.rounds} journées.
                </p>
              )}
            </section>
          );
        })}

        {data && (
          <p className="text-[11px] text-subtle">
            Modèle {data.model.version}
            {data.model.samples ? `, appris sur ${data.model.samples.toLocaleString("fr-FR")} matchs-joueurs` : ""}. Limites : la cote MPG
            de la saison précédente n&apos;est pas connue à la date de chaque match, et les cotes des bookmakers ne servent qu&apos;aux matchs à venir.
          </p>
        )}
      </div>
    </div>
  );
}
