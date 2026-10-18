"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { deleteLeague, listLeagues, type ManualLeague } from "@/lib/manual-league";
import { getChampionshipById } from "@/lib/championships";
import { EmptyState } from "@/components/EmptyState";
import { Flag } from "@/components/Flag";
import { notifyLeagues } from "@/lib/client/use-league";

let cache: { raw: string; value: ManualLeague[] } | null = null;
function readLeagues(): ManualLeague[] {
  const value = listLeagues();
  const raw = JSON.stringify(value);
  if (cache?.raw === raw) return cache.value;
  cache = { raw, value };
  return value;
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("leagues-changed", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("leagues-changed", cb);
  };
}

export default function HomePage() {
  const leagues = useSyncExternalStore(subscribe, readLeagues, () => null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function handleDelete(id: string) {
    deleteLeague(id);
    setConfirming(null);
    notifyLeagues();
    window.dispatchEvent(new Event("leagues-changed"));
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-8">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center gap-3">
          <Image src="/logo.png" alt="" width={40} height={40} className="h-10 w-10" priority />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-fg">Le 11 parfait</h1>
            <p className="text-sm text-muted">Ton meilleur 11, chaque journée</p>
          </div>
          <Link href="/precision" className="shrink-0 rounded-full bg-chip px-3 py-1 text-xs text-muted">
            Notre précision
          </Link>
        </header>

        {leagues === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-card" />
            ))}
          </div>
        ) : leagues.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              icon="⚽"
              title="Aucune ligue"
              description="Crée ta ligue, compose ton effectif (ou importe-le depuis MPG) : l'app te propose ton meilleur 11, ton banc et ton capitaine."
            />
            <Link href="/importer/mpg" className="block rounded-xl border border-line bg-card p-4 text-center text-sm text-fg">
              Importer mes ligues depuis MPG →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {leagues.map((l) => {
              const champ = getChampionshipById(l.championshipId);
              const last = l.history[0];
              return (
                <li key={l.id}>
                  <div className="flex items-stretch gap-2">
                    <Link href={`/ligue/${l.id}`} className="min-w-0 flex-1 rounded-xl border border-line bg-card p-4 transition hover:border-emerald-500/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-fg">{l.name}</span>
                        <span className="shrink-0 text-sm text-muted">
                          {l.playerIds.length} joueur{l.playerIds.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                        {champ && <Flag code={champ.countryCode} size={16} />}
                        {champ?.name ?? "Championnat"}
                        {last && <span className="text-subtle">· J{last.round} : {last.teamMean.toFixed(1)} pts attendus</span>}
                      </p>
                    </Link>
                    {confirming === l.id ? (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => handleDelete(l.id)} className="flex-1 rounded-xl bg-red-600 px-3 text-xs font-medium text-white">
                          Supprimer
                        </button>
                        <button onClick={() => setConfirming(null)} className="flex-1 rounded-xl bg-chip px-3 text-xs text-fg">
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirming(l.id)}
                        aria-label={`Supprimer ${l.name}`}
                        className="rounded-xl border border-line bg-card px-3 text-muted transition hover:border-red-500/50 hover:text-danger"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <Link href="/importer/mpg" className="flex-1 rounded-lg border border-line bg-card px-3 py-3 text-center text-sm font-medium text-fg">
            Depuis MPG
          </Link>
          <Link
            href="/creer"
            className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
          >
            <span className="text-lg leading-none">+</span> Créer une ligue
          </Link>
        </div>
      </div>
    </div>
  );
}
