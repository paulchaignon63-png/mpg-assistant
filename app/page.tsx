"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listLeagues, deleteLeague, type ManualLeague } from "@/lib/manual-league";
import { getChampionshipById } from "@/lib/championships";
import { EmptyState } from "@/components/EmptyState";

export default function HomePage() {
  const [leagues, setLeagues] = useState<ManualLeague[] | null>(null);

  useEffect(() => {
    setLeagues(listLeagues());
  }, []);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer la ligue « ${name} » ?`)) return;
    deleteLeague(id);
    setLeagues(listLeagues());
  }

  return (
    <div className="min-h-screen bg-[#0A1F1C] px-4 pb-24 pt-8">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-bold text-[#F9FAFB]">Le 11 parfait</h1>
            <p className="text-sm text-[#9CA3AF]">Ton meilleur 11, chaque journée</p>
          </div>
        </header>

        {leagues === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-[#1F4641] bg-[#0F2F2B]/50"
              />
            ))}
          </div>
        ) : leagues.length === 0 ? (
          <EmptyState
            icon="⚽"
            title="Aucune ligue"
            description="Crée ta première ligue, choisis ton championnat et compose ton effectif. L'app te proposera ton meilleur 11."
          />
        ) : (
          <ul className="space-y-3">
            {leagues.map((l) => {
              const champ = getChampionshipById(l.championshipId);
              return (
                <li key={l.id}>
                  <div className="flex items-stretch gap-2">
                    <Link
                      href={`/ligue/${l.id}`}
                      className="flex-1 rounded-xl border border-[#1F4641] bg-[#0F2F2B] p-4 transition hover:border-emerald-500/50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#F9FAFB]">{l.name}</span>
                        <span className="text-sm text-[#9CA3AF]">
                          {l.playerIds.length} joueur{l.playerIds.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#9CA3AF]">
                        {champ?.name ?? "Championnat"}
                      </p>
                    </Link>
                    <button
                      onClick={() => handleDelete(l.id, l.name)}
                      aria-label={`Supprimer ${l.name}`}
                      className="rounded-xl border border-[#1F4641] bg-[#0F2F2B] px-3 text-[#9CA3AF] transition hover:border-red-500/50 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bouton flottant : créer une ligue */}
      <div className="fixed inset-x-0 bottom-0 border-t border-[#1F4641] bg-[#0A1F1C]/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Link
            href="/creer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-[#F9FAFB] transition hover:bg-emerald-500"
          >
            <span className="text-lg leading-none">+</span> Créer une ligue
          </Link>
        </div>
      </div>
    </div>
  );
}
