"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getLeague,
  type ManualLeague,
  type RosterPlayer,
} from "@/lib/manual-league";
import { getChampionshipById } from "@/lib/championships";

const POS_ORDER: Array<"G" | "D" | "M" | "A"> = ["G", "D", "M", "A"];
const POS_LABEL: Record<string, string> = {
  G: "Gardien",
  D: "Défenseurs",
  M: "Milieux",
  A: "Attaquants",
};
const POS_COLOR: Record<string, string> = {
  G: "bg-amber-500/15 text-amber-300",
  D: "bg-sky-500/15 text-sky-300",
  M: "bg-emerald-500/15 text-emerald-300",
  A: "bg-rose-500/15 text-rose-300",
};

export default function LeaguePage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [league, setLeague] = useState<ManualLeague | null | undefined>(undefined);
  const [pool, setPool] = useState<RosterPlayer[] | null>(null);

  useEffect(() => {
    const lg = getLeague(leagueId);
    setLeague(lg ?? null);
    if (!lg) return;
    fetch(`/api/pool/${lg.championshipId}`)
      .then((r) => r.json())
      .then((d) => setPool(Array.isArray(d.players) ? d.players : []))
      .catch(() => setPool([]));
  }, [leagueId]);

  const squad = useMemo(() => {
    if (!league || !pool) return null;
    const ids = new Set(league.playerIds);
    const byPos: Record<string, RosterPlayer[]> = { G: [], D: [], M: [], A: [] };
    for (const p of pool) if (ids.has(p.id)) byPos[p.position].push(p);
    for (const k of POS_ORDER) byPos[k].sort((a, b) => a.name.localeCompare(b.name));
    return byPos;
  }, [league, pool]);

  if (league === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1F1C] p-6 text-center text-[#9CA3AF]">
        <div>
          <p>Ligue introuvable.</p>
          <Link href="/" className="mt-3 inline-block text-emerald-400">← Mes ligues</Link>
        </div>
      </div>
    );
  }

  const champ = league ? getChampionshipById(league.championshipId) : undefined;
  const count = league?.playerIds.length ?? 0;

  return (
    <div className="min-h-screen bg-[#0A1F1C] px-4 pb-28 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-5 inline-block text-sm text-[#9CA3AF] hover:text-[#F9FAFB]">
          ← Mes ligues
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#F9FAFB]">{league?.name}</h1>
          <p className="text-sm text-[#9CA3AF]">
            {champ?.name} · {count} joueur{count > 1 ? "s" : ""}
          </p>
        </div>

        {count === 0 ? (
          <div className="rounded-xl border border-[#1F4641] bg-[#0F2F2B]/50 p-6 text-center">
            <p className="text-[#9CA3AF]">Ton effectif est vide.</p>
            <Link
              href={`/ligue/${leagueId}/effectif`}
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-[#F9FAFB] hover:bg-emerald-500"
            >
              Composer l&apos;effectif
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {squad &&
              POS_ORDER.map((pos) =>
                squad[pos].length === 0 ? null : (
                  <div key={pos}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                      {POS_LABEL[pos]} ({squad[pos].length})
                    </p>
                    <div className="space-y-1.5">
                      {squad[pos].map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg border border-[#1F4641] bg-[#0F2F2B] px-3 py-2.5"
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold ${POS_COLOR[pos]}`}
                          >
                            {pos}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-[#F9FAFB]">{p.name}</span>
                            <span className="block truncate text-xs text-[#9CA3AF]">{p.club}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#1F4641] bg-[#0A1F1C]/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <Link
            href={`/ligue/${leagueId}/effectif`}
            className="flex-1 rounded-lg border border-[#1F4641] bg-[#0F2F2B] px-4 py-3 text-center font-medium text-[#F9FAFB] transition hover:border-emerald-500/50"
          >
            Modifier l&apos;effectif
          </Link>
          <Link
            href={`/ligue/${leagueId}/onze`}
            aria-disabled={count === 0}
            className={`flex-1 rounded-lg px-4 py-3 text-center font-medium transition ${
              count === 0
                ? "pointer-events-none bg-[#1F4641] text-[#6B7280]"
                : "bg-emerald-600 text-[#F9FAFB] hover:bg-emerald-500"
            }`}
          >
            Mon meilleur 11
          </Link>
        </div>
      </div>
    </div>
  );
}
