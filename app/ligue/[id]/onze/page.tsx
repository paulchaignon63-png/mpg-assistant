"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getLeague,
  updateLeague,
  type ManualLeague,
} from "@/lib/manual-league";
import {
  AVAILABLE_FORMATIONS,
  formatFormation,
} from "@/lib/recommendation";

interface ResultPlayer {
  id?: string;
  name?: string;
  position?: "G" | "D" | "M" | "A";
  clubName?: string;
  recommendationScore: number;
  statusReason?: string;
  statusKind?: "ok" | "injured" | "suspended" | "doubtful";
  scoreZeroReason?: "injured" | "suspended";
}

interface OnzeResult {
  formation: number;
  nextMatchDate: string | null;
  recommended: ResultPlayer[];
  substitutes: Record<"G" | "D" | "M" | "A", ResultPlayer[]>;
  lofteurs: ResultPlayer[];
  suggestedCaptainId: string | null;
}

const POS_COLOR: Record<string, string> = {
  G: "bg-amber-500/15 text-amber-300",
  D: "bg-sky-500/15 text-sky-300",
  M: "bg-emerald-500/15 text-emerald-300",
  A: "bg-rose-500/15 text-rose-300",
};
const POS_ORDER: Array<"G" | "D" | "M" | "A"> = ["G", "D", "M", "A"];
const POS_LABEL: Record<string, string> = {
  G: "Gardien",
  D: "Défense",
  M: "Milieu",
  A: "Attaque",
};

export default function OnzePage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [league, setLeague] = useState<ManualLeague | null | undefined>(undefined);
  const [formation, setFormation] = useState<number>(343);
  const [result, setResult] = useState<OnzeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const lg = getLeague(leagueId);
    setLeague(lg ?? null);
    if (lg) setFormation(lg.formation);
  }, [leagueId]);

  useEffect(() => {
    if (league === undefined || league === null) return;
    setLoading(true);
    setError(null);
    fetch("/api/recommendations/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        championshipId: league.championshipId,
        formation,
        playerIds: league.playerIds,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setResult(d);
      })
      .catch(() => setError("Impossible de calculer le 11"))
      .finally(() => setLoading(false));
  }, [league, formation]);

  function changeFormation(f: number) {
    setFormation(f);
    updateLeague(leagueId, { formation: f });
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
    <div className="min-h-screen bg-[#0A1F1C] px-4 pb-16 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={`/ligue/${leagueId}`}
          className="mb-5 inline-block text-sm text-[#9CA3AF] hover:text-[#F9FAFB]"
        >
          ← {league?.name ?? "Retour"}
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-[#F9FAFB]">Ton meilleur 11</h1>
        {result?.nextMatchDate && (
          <p className="mb-4 text-sm text-[#9CA3AF]">
            Prochain match&nbsp;:{" "}
            {new Date(result.nextMatchDate).toLocaleString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        {/* Sélecteur de formation */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {AVAILABLE_FORMATIONS.map((f) => (
            <button
              key={f}
              onClick={() => changeFormation(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${
                formation === f
                  ? "bg-emerald-600 text-[#F9FAFB]"
                  : "bg-[#1F4641] text-[#9CA3AF]"
              }`}
            >
              {formatFormation(f)}
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-[#0F2F2B]/50" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {result && !loading && (
          <>
            {POS_ORDER.map((pos) => {
              const line = result.recommended.filter((p) => p.position === pos);
              if (line.length === 0) return null;
              return (
                <div key={pos} className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    {POS_LABEL[pos]}
                  </p>
                  <div className="space-y-1.5">
                    {line.map((p) => (
                      <PlayerLine
                        key={p.id ?? p.name}
                        p={p}
                        captain={
                          (p.id ?? p.name) === result.suggestedCaptainId
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Remplaçants */}
            {(["G", "D", "M", "A"] as const).some(
              (k) => (result.substitutes[k] ?? []).length > 0
            ) && (
              <div className="mt-6">
                <h2 className="mb-2 text-sm font-bold text-[#F9FAFB]">Sur le banc</h2>
                <div className="space-y-1.5">
                  {POS_ORDER.flatMap((pos) => result.substitutes[pos] ?? []).map((p) => (
                    <PlayerLine key={p.id ?? p.name} p={p} muted />
                  ))}
                </div>
              </div>
            )}

            {/* Écartés (blessés / suspendus) */}
            {result.lofteurs.filter((p) => p.recommendationScore === 0).length > 0 && (
              <div className="mt-6">
                <h2 className="mb-2 text-sm font-bold text-[#F9FAFB]">
                  Indisponibles
                </h2>
                <div className="space-y-1.5">
                  {result.lofteurs
                    .filter((p) => p.recommendationScore === 0)
                    .map((p) => (
                      <PlayerLine key={p.id ?? p.name} p={p} muted />
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function statusLabel(p: ResultPlayer): string | null {
  const kind = p.statusKind ?? p.scoreZeroReason;
  if (kind === "injured") return "Blessé";
  if (kind === "suspended") return "Suspendu";
  if (kind === "doubtful") return "Incertain";
  return null;
}

function PlayerLine({
  p,
  captain,
  muted,
}: {
  p: ResultPlayer;
  captain?: boolean;
  muted?: boolean;
}) {
  const status = statusLabel(p);
  const score = p.recommendationScore;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        muted
          ? "border-[#1F4641] bg-[#0F2F2B]/50"
          : "border-[#1F4641] bg-[#0F2F2B]"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold ${POS_COLOR[p.position ?? "M"]}`}
      >
        {p.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-[#F9FAFB]">{p.name}</span>
          {captain && (
            <span className="shrink-0 rounded bg-emerald-500 px-1 text-[10px] font-bold text-[#0A1F1C]">
              C
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-[#9CA3AF]">
          {p.clubName}
          {status && <span className="ml-1 text-red-400">· {status}</span>}
        </span>
      </span>
      {score > 0 && (
        <span className="shrink-0 rounded-md bg-[#1F4641] px-2 py-1 text-sm font-semibold text-[#F9FAFB]">
          {score.toFixed(1)}
        </span>
      )}
    </div>
  );
}
