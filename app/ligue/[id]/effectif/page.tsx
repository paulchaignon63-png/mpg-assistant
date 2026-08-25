"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  getLeague,
  updateLeague,
  type ManualLeague,
  type RosterPlayer,
} from "@/lib/manual-league";

const POSITIONS: Array<{ key: "G" | "D" | "M" | "A"; label: string }> = [
  { key: "G", label: "Gardiens" },
  { key: "D", label: "Défenseurs" },
  { key: "M", label: "Milieux" },
  { key: "A", label: "Attaquants" },
];

const POS_COLOR: Record<string, string> = {
  G: "bg-amber-500/15 text-amber-300",
  D: "bg-sky-500/15 text-sky-300",
  M: "bg-emerald-500/15 text-emerald-300",
  A: "bg-rose-500/15 text-rose-300",
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

export default function RosterPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const leagueId = params.id;

  const [league, setLeague] = useState<ManualLeague | null | undefined>(undefined);
  const [pool, setPool] = useState<RosterPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<"G" | "D" | "M" | "A" | null>(null);
  const [clubFilter, setClubFilter] = useState<string>("");

  // Charger la ligue (localStorage) puis le vivier du championnat.
  useEffect(() => {
    const lg = getLeague(leagueId);
    setLeague(lg ?? null);
    if (!lg) return;
    setSelected(new Set(lg.playerIds));
    fetch(`/api/pool/${lg.championshipId}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.players) && d.players.length) setPool(d.players);
        else setError(d.error ?? "Vivier indisponible");
      })
      .catch(() => setError("Impossible de charger les joueurs"));
  }, [leagueId]);

  const clubs = useMemo(() => {
    if (!pool) return [];
    return Array.from(new Set(pool.map((p) => p.club).filter(Boolean))).sort();
  }, [pool]);

  const filtered = useMemo(() => {
    if (!pool) return [];
    const q = normalize(search);
    return pool.filter((p) => {
      if (posFilter && p.position !== posFilter) return false;
      if (clubFilter && p.club !== clubFilter) return false;
      if (q && !normalize(p.name).includes(q)) return false;
      return true;
    });
  }, [pool, search, posFilter, clubFilter]);

  // Les joueurs déjà choisis, remontés en tête quand aucun filtre de recherche.
  const selectedPlayers = useMemo(
    () => (pool ? pool.filter((p) => selected.has(p.id)) : []),
    [pool, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Sauvegarde immédiate : rien n'est jamais perdu.
      updateLeague(leagueId, { playerIds: Array.from(next) });
      return next;
    });
  }

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

  return (
    <div className="min-h-screen bg-[#0A1F1C] pb-24">
      {/* En-tête + recherche, collés en haut */}
      <div className="sticky top-0 z-10 border-b border-[#1F4641] bg-[#0A1F1C]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-between">
            <Link href={`/ligue/${leagueId}`} className="text-sm text-[#9CA3AF] hover:text-[#F9FAFB]">
              ← Retour
            </Link>
            <span className="text-sm font-medium text-emerald-400">
              {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un joueur…"
            className="w-full rounded-lg border border-[#1F4641] bg-[#0F2F2B] px-4 py-2.5 text-[#F9FAFB] placeholder-[#6B7280] focus:border-emerald-500/50 focus:outline-none"
          />

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {POSITIONS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPosFilter(posFilter === p.key ? null : p.key)}
                className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${
                  posFilter === p.key
                    ? "bg-emerald-600 text-[#F9FAFB]"
                    : "bg-[#1F4641] text-[#9CA3AF]"
                }`}
              >
                {p.key}
              </button>
            ))}
            <select
              value={clubFilter}
              onChange={(e) => setClubFilter(e.target.value)}
              className="shrink-0 rounded-full border-0 bg-[#1F4641] px-3 py-1 text-sm text-[#9CA3AF] focus:outline-none"
            >
              <option value="">Tous les clubs</option>
              {clubs.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4">
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {pool === null && !error && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-[#0F2F2B]/50" />
            ))}
          </div>
        )}

        {/* Effectif en cours, quand on ne cherche pas */}
        {pool && !search && !posFilter && !clubFilter && selectedPlayers.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Ton effectif
            </p>
            <div className="space-y-1.5">
              {selectedPlayers.map((p) => (
                <PlayerRow key={p.id} player={p} selected onToggle={() => toggle(p.id)} />
              ))}
            </div>
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Ajouter des joueurs
            </p>
          </div>
        )}

        {pool && (
          <div className="space-y-1.5">
            {filtered.slice(0, 120).map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                selected={selected.has(p.id)}
                onToggle={() => toggle(p.id)}
              />
            ))}
            {filtered.length > 120 && (
              <p className="py-3 text-center text-sm text-[#6B7280]">
                Affine ta recherche pour voir les {filtered.length - 120} autres joueurs.
              </p>
            )}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-[#6B7280]">Aucun joueur trouvé.</p>
            )}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#1F4641] bg-[#0A1F1C]/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => router.push(`/ligue/${leagueId}`)}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-[#F9FAFB] transition hover:bg-emerald-500"
          >
            Terminer ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onToggle,
}: {
  player: RosterPlayer;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
        selected
          ? "border-emerald-500 bg-emerald-600/15"
          : "border-[#1F4641] bg-[#0F2F2B] hover:border-emerald-500/40"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold ${POS_COLOR[player.position]}`}
      >
        {player.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[#F9FAFB]">{player.name}</span>
        <span className="block truncate text-xs text-[#9CA3AF]">{player.club}</span>
      </span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
          selected ? "bg-emerald-500 text-[#0A1F1C]" : "border border-[#3A5A54] text-[#6B7280]"
        }`}
      >
        {selected ? "✓" : "+"}
      </span>
    </button>
  );
}
