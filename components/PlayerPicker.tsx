"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterPlayer } from "@/lib/manual-league";

const POSITIONS: Array<"G" | "D" | "M" | "A"> = ["G", "D", "M", "A"];

export const POS_STYLE: Record<string, string> = {
  G: "bg-amber-500/15 text-pos-g",
  D: "bg-sky-500/15 text-pos-d",
  M: "bg-emerald-500/15 text-pos-m",
  A: "bg-rose-500/15 text-pos-a",
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

/** Vivier d'un championnat (nom, club, poste, cote, moyenne). */
export function usePool(championshipId: string | undefined) {
  const [pool, setPool] = useState<RosterPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!championshipId) return;
    let cancelled = false;
    fetch(`/api/pool/${championshipId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.players) && d.players.length) setPool(d.players);
        else setError(d.error ?? "Vivier indisponible");
      })
      .catch(() => !cancelled && setError("Impossible de charger les joueurs"));
    return () => {
      cancelled = true;
    };
  }, [championshipId]);
  return { pool, error };
}

export function PlayerRow({
  player,
  selected,
  onToggle,
}: {
  player: RosterPlayer;
  selected: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
        selected ? "border-emerald-500 bg-emerald-600/15" : "border-line bg-card hover:border-emerald-500/40"
      }`}
    >
      <span className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold ${POS_STYLE[player.position]}`}>
        {player.detailedPosition || player.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{player.name}</span>
        <span className="block truncate text-xs text-muted">
          {player.club}
          {player.average != null && <> · moy. {player.average.toFixed(2)} ({player.matches} m.)</>}
        </span>
      </span>
      {player.quotation != null && (
        <span className="shrink-0 text-right text-xs tabular-nums text-muted">
          <span className="block text-sm font-semibold text-fg">{player.quotation}</span>
          cote
        </span>
      )}
      {onToggle && (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
            selected ? "bg-emerald-500 text-on-accent" : "border border-chip-strong text-subtle"
          }`}
        >
          {selected ? "✓" : "+"}
        </span>
      )}
    </button>
  );
}

/** Recherche et sélection de joueurs dans le vivier. */
export function PlayerPicker({
  pool,
  selected,
  onToggle,
  emptyHint,
}: {
  pool: RosterPlayer[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyHint?: string;
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<"G" | "D" | "M" | "A" | null>(null);
  const [clubFilter, setClubFilter] = useState("");
  const [sort, setSort] = useState<"club" | "quotation" | "average">("club");

  const clubs = useMemo(() => Array.from(new Set(pool.map((p) => p.club).filter(Boolean))).sort(), [pool]);
  const filtered = useMemo(() => {
    const q = normalize(search);
    const list = pool.filter((p) => {
      if (posFilter && p.position !== posFilter) return false;
      if (clubFilter && p.club !== clubFilter) return false;
      if (q && !normalize(p.name).includes(q)) return false;
      return true;
    });
    if (sort === "quotation") list.sort((a, b) => (b.quotation ?? 0) - (a.quotation ?? 0));
    if (sort === "average") list.sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
    return list;
  }, [pool, search, posFilter, clubFilter, sort]);

  const chosen = useMemo(() => pool.filter((p) => selected.has(p.id)), [pool, selected]);
  const idle = !search && !posFilter && !clubFilter;

  return (
    <div className="space-y-3">
      <input
        id="player-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un joueur…"
        className="w-full rounded-lg border border-line bg-card px-4 py-2.5 text-fg placeholder-subtle focus:border-emerald-500/50 focus:outline-none"
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPosFilter(posFilter === p ? null : p)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${posFilter === p ? "bg-emerald-600 text-white" : "bg-chip text-muted"}`}
          >
            {p}
          </button>
        ))}
        <select
          id="club-filter"
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value)}
          className="shrink-0 rounded-full border-0 bg-chip px-3 py-1 text-sm text-muted focus:outline-none"
        >
          <option value="">Tous les clubs</option>
          {clubs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          id="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="shrink-0 rounded-full border-0 bg-chip px-3 py-1 text-sm text-muted focus:outline-none"
        >
          <option value="club">Tri : club</option>
          <option value="quotation">Tri : cote</option>
          <option value="average">Tri : moyenne</option>
        </select>
      </div>

      {idle && chosen.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Sélection ({chosen.length})</p>
          <div className="space-y-1.5">
            {chosen.map((p) => (
              <PlayerRow key={p.id} player={p} selected onToggle={() => onToggle(p.id)} />
            ))}
          </div>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-subtle">Ajouter des joueurs</p>
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.slice(0, 120).map((p) => (
          <PlayerRow key={p.id} player={p} selected={selected.has(p.id)} onToggle={() => onToggle(p.id)} />
        ))}
        {filtered.length > 120 && (
          <p className="py-3 text-center text-sm text-subtle">Affine ta recherche pour voir les {filtered.length - 120} autres joueurs.</p>
        )}
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-subtle">{emptyHint ?? "Aucun joueur trouvé."}</p>}
      </div>
    </div>
  );
}
