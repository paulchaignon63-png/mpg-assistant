"use client";

import { useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useLeague } from "@/lib/client/use-league";
import { PlayerPicker, usePool } from "@/components/PlayerPicker";
import { ImportPanel } from "@/components/ImportPanel";

export default function RosterPage() {
  const router = useRouter();
  const { id: leagueId } = useParams<{ id: string }>();
  const [league, update] = useLeague(leagueId);
  const { pool, error } = usePool(league?.championshipId);
  const selected = useMemo(() => new Set(league?.playerIds ?? []), [league]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Sauvegarde immédiate : rien n'est jamais perdu.
    update({ playerIds: [...next] });
  }

  if (league === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted">
        <div>
          <p>Ligue introuvable.</p>
          <Link href="/" className="mt-3 inline-block text-accent">
            ← Mes ligues
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-[env(safe-area-inset-top)] z-10 border-b border-line bg-bg/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link href={`/ligue/${leagueId}`} className="text-sm text-muted hover:text-fg">
            ← Retour
          </Link>
          <span className="text-sm font-medium text-accent">
            {selected.size} joueur{selected.size > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-danger">{error}</p>}
        {pool === null && !error && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-card" />
            ))}
          </div>
        )}
        {pool && (
          <>
            <ImportPanel
              pool={pool}
              leagueId={leagueId}
              onImport={(ids) => update({ playerIds: [...new Set([...(league?.playerIds ?? []), ...ids])] })}
            />
            <PlayerPicker pool={pool} selected={selected} onToggle={toggle} />
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => router.push(`/ligue/${leagueId}`)}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500"
          >
            Terminer ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
