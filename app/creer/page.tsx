"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupportedChampionships } from "@/lib/championships";
import { createLeague } from "@/lib/manual-league";
import { Flag } from "@/components/Flag";

export default function CreateLeaguePage() {
  const router = useRouter();
  const championships = getSupportedChampionships();
  const [name, setName] = useState("");
  const [championshipId, setChampionshipId] = useState<string>("1");

  function handleCreate() {
    const league = createLeague({ name, championshipId });
    // On enchaîne directement sur la composition de l'effectif.
    router.push(`/ligue/${league.id}/effectif`);
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-6 inline-block text-sm text-muted hover:text-fg">
          ← Mes ligues
        </Link>

        <h1 className="mb-6 text-2xl font-bold text-fg">Nouvelle ligue</h1>

        <label htmlFor="name" className="mb-1 block text-sm font-medium text-muted">
          Nom de la ligue
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Ligue des potes"
          className="mb-6 w-full rounded-lg border border-line bg-card px-4 py-2.5 text-fg placeholder-subtle focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        />

        <p className="mb-2 text-sm font-medium text-muted">Championnat</p>
        <div className="grid grid-cols-2 gap-2">
          {championships.map((c) => {
            const selected = c.id === championshipId;
            return (
              <button
                key={c.id}
                onClick={() => setChampionshipId(c.id)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-left transition ${
                  selected
                    ? "border-emerald-500 bg-emerald-600/15 text-fg"
                    : "border-line bg-card text-muted hover:border-emerald-500/40"
                }`}
              >
                <Flag code={c.countryCode} size={24} />
                <span className="font-medium">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={handleCreate}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-fg transition hover:bg-emerald-500"
          >
            Composer l&apos;effectif →
          </button>
        </div>
      </div>
    </div>
  );
}
