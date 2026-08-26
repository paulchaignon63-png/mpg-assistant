"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getLeague, updateLeague, type ManualLeague } from "@/lib/manual-league";
import { AVAILABLE_FORMATIONS, formatFormation } from "@/lib/recommendation";
import { Jersey } from "@/components/Jersey";

interface Reason {
  label: string;
  positive: boolean;
}
interface ResultPlayer {
  id?: string;
  name?: string;
  position?: "G" | "D" | "M" | "A";
  clubName?: string;
  recommendationScore: number;
  statusKind?: "ok" | "injured" | "suspended" | "doubtful";
  scoreZeroReason?: "injured" | "suspended";
  nextOpponentName?: string;
  isHome?: boolean;
  reasons?: Reason[];
}
interface SubEndpoint {
  id: string;
  name?: string;
  clubName?: string;
  position: "G" | "D" | "M" | "A";
  score: number;
}
interface TacticalSub {
  kind: "securite" | "alternative";
  reason: string;
  out: SubEndpoint;
  in: SubEndpoint;
}
interface OnzeResult {
  formation: number;
  nextMatchDate: string | null;
  recommended: ResultPlayer[];
  substitutes: Record<"G" | "D" | "M" | "A", ResultPlayer[]>;
  lofteurs: ResultPlayer[];
  suggestedCaptainId: string | null;
  tacticalSubs?: TacticalSub[];
}

const POS_ORDER: Array<"G" | "D" | "M" | "A"> = ["G", "D", "M", "A"];
// Bandes verticales sur le terrain (haut = attaque).
const LINE_TOP: Record<string, number> = { A: 12, M: 37, D: 62, G: 86 };

function surname(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}
function scoreTier(s: number): string {
  if (s >= 6) return "bg-emerald-500 text-[#04120E]";
  if (s >= 5) return "bg-amber-400 text-[#1a1400]";
  return "bg-[#3A5A54] text-[#F9FAFB]";
}
function statusLabel(p: ResultPlayer): string | null {
  const k = p.statusKind ?? p.scoreZeroReason;
  if (k === "injured") return "Blessé";
  if (k === "suspended") return "Suspendu";
  if (k === "doubtful") return "Incertain";
  return null;
}
function pid(p: ResultPlayer): string {
  return p.id ?? p.name ?? "";
}

export default function OnzePage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [league, setLeague] = useState<ManualLeague | null | undefined>(undefined);
  const [formation, setFormation] = useState<number>(343);
  const [result, setResult] = useState<OnzeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ResultPlayer | null>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);

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
      .then((d) => (d.error ? setError(d.error) : setResult(d)))
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

  const captainId = result?.suggestedCaptainId ?? null;

  return (
    <div className="min-h-screen bg-[#0A1F1C] px-4 pb-16 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={`/ligue/${leagueId}`}
          className="mb-4 inline-block text-sm text-[#9CA3AF] hover:text-[#F9FAFB]"
        >
          ← {league?.name ?? "Retour"}
        </Link>

        <h1 className="text-2xl font-bold text-[#F9FAFB]">Ta compo</h1>
        <p className="text-sm text-[#9CA3AF]">
          {result?.nextMatchDate
            ? `Prochain match : ${new Date(result.nextMatchDate).toLocaleString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Ton meilleur onze"}
        </p>

        <div className="mt-4 mb-4 flex gap-2 overflow-x-auto pb-1">
          {AVAILABLE_FORMATIONS.map((f) => (
            <button
              key={f}
              onClick={() => changeFormation(f)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${
                formation === f ? "bg-emerald-600 text-[#F9FAFB]" : "bg-[#1F4641] text-[#9CA3AF]"
              }`}
            >
              {formatFormation(f)}
            </button>
          ))}
        </div>

        {loading && (
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-[#0F2F2B]/60" />
        )}
        {error && !loading && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {result && !loading && (
          <>
            {/* Terrain */}
            <div
              className="relative w-full overflow-hidden rounded-2xl border border-[#1F4641]"
              style={{
                aspectRatio: "3 / 4",
                background:
                  "repeating-linear-gradient(180deg, #14532d 0 12.5%, #166534 12.5% 25%)",
              }}
            >
              <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-white/20" />
              <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-0 border-t-2 border-white/20" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
              <div className="pointer-events-none absolute left-1/2 top-2 h-14 w-28 -translate-x-1/2 border-2 border-t-0 border-white/20" />
              <div className="pointer-events-none absolute bottom-2 left-1/2 h-14 w-28 -translate-x-1/2 border-2 border-b-0 border-white/20" />

              {POS_ORDER.map((pos) => {
                const line = result.recommended.filter((p) => p.position === pos);
                const n = line.length;
                return line.map((p, i) => (
                  <button
                    key={pid(p)}
                    onClick={() => setSelected(p)}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                    style={{ top: `${LINE_TOP[pos]}%`, left: `${((i + 1) / (n + 1)) * 100}%` }}
                  >
                    <div className="relative">
                      <Jersey club={p.clubName} size={42} />
                      {pid(p) === captainId && (
                        <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[9px] font-bold text-[#04120E]">
                          C
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-1 -right-1 rounded px-1 text-[10px] font-bold ${scoreTier(
                          p.recommendationScore
                        )}`}
                      >
                        {p.recommendationScore.toFixed(1)}
                      </span>
                    </div>
                    <span className="mt-0.5 max-w-[72px] truncate rounded bg-black/45 px-1 text-[11px] font-medium text-white">
                      {surname(p.name)}
                    </span>
                  </button>
                ));
              })}
            </div>

            <p className="mt-2 text-center text-xs text-[#6B7280]">
              Touche un joueur pour voir <span className="text-[#9CA3AF]">notre note</span> et
              pourquoi.
            </p>

            {result.tacticalSubs && result.tacticalSubs.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-1 text-sm font-bold text-[#F9FAFB]">
                  Remplacements tactiques
                </h2>
                <p className="mb-3 text-xs text-[#6B7280]">
                  Des suggestions, pas des obligations. Touche « ? » pour le pourquoi.
                </p>
                <div className="space-y-2">
                  {result.tacticalSubs.map((s, i) => (
                    <div
                      key={`${s.out.id}-${s.in.id}`}
                      className="rounded-xl border border-[#1F4641] bg-[#0F2F2B] p-3"
                    >
                      <div className="flex items-center gap-2">
                        {/* Sortant */}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Jersey club={s.out.clubName} size={30} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#F9FAFB]">
                              {surname(s.out.name)}
                            </div>
                            <div className="text-[10px] text-[#6B7280]">
                              {s.out.score.toFixed(1)}
                            </div>
                          </div>
                        </div>

                        <span className="shrink-0 text-emerald-400">→</span>

                        {/* Entrant */}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Jersey club={s.in.clubName} size={30} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#F9FAFB]">
                              {surname(s.in.name)}
                            </div>
                            <div className="text-[10px] text-[#6B7280]">
                              {s.in.score.toFixed(1)}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setOpenSub(openSub === i ? null : i)}
                          aria-label="Pourquoi cette suggestion"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                            openSub === i
                              ? "bg-emerald-500 text-[#04120E]"
                              : "bg-[#1F4641] text-[#9CA3AF]"
                          }`}
                        >
                          ?
                        </button>
                      </div>

                      {openSub === i && (
                        <div className="mt-3 border-t border-[#1F4641] pt-3">
                          <span
                            className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              s.kind === "securite"
                                ? "bg-amber-400/15 text-amber-300"
                                : "bg-sky-400/15 text-sky-300"
                            }`}
                          >
                            {s.kind === "securite" ? "Sécurité" : "Alternative"}
                          </span>
                          <span className="text-sm text-[#F9FAFB]">{s.reason}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(["G", "D", "M", "A"] as const).some((k) => (result.substitutes[k] ?? []).length > 0) && (
              <div className="mt-6">
                <h2 className="mb-2 text-sm font-bold text-[#F9FAFB]">Sur le banc</h2>
                <div className="flex flex-wrap gap-2">
                  {POS_ORDER.flatMap((pos) => result.substitutes[pos] ?? []).map((p) => (
                    <button
                      key={pid(p)}
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-2 rounded-lg border border-[#1F4641] bg-[#0F2F2B] py-1.5 pl-1.5 pr-2.5"
                    >
                      <Jersey club={p.clubName} size={26} />
                      <span className="text-sm text-[#F9FAFB]">{surname(p.name)}</span>
                      <span className={`rounded px-1 text-[10px] font-bold ${scoreTier(p.recommendationScore)}`}>
                        {p.recommendationScore.toFixed(1)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {result.lofteurs.filter((p) => p.recommendationScore === 0).length > 0 && (
              <div className="mt-5">
                <h2 className="mb-2 text-sm font-bold text-[#F9FAFB]">Indisponibles</h2>
                <div className="flex flex-wrap gap-1.5">
                  {result.lofteurs
                    .filter((p) => p.recommendationScore === 0)
                    .map((p) => (
                      <span
                        key={pid(p)}
                        className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs text-red-300"
                      >
                        {surname(p.name)} · {statusLabel(p) ?? "absent"}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <PlayerSheet
          p={selected}
          captain={pid(selected) === captainId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PlayerSheet({
  p,
  captain,
  onClose,
}: {
  p: ResultPlayer;
  captain: boolean;
  onClose: () => void;
}) {
  const status = statusLabel(p);
  const reasons = p.reasons ?? [];
  return (
    <div className="fixed inset-0 z-20 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full rounded-t-2xl border-t border-[#1F4641] bg-[#0F2F2B] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#3A5A54]" />

        <div className="flex items-center gap-3">
          <Jersey club={p.clubName} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-bold text-[#F9FAFB]">{p.name}</span>
              {captain && (
                <span className="rounded bg-emerald-500 px-1.5 text-[11px] font-bold text-[#04120E]">
                  Capitaine
                </span>
              )}
            </div>
            <div className="truncate text-sm text-[#9CA3AF]">
              {p.clubName}
              {p.nextOpponentName && (
                <span className="text-[#6B7280]">
                  {" → "}
                  {p.nextOpponentName} {p.isHome ? "(dom.)" : "(ext.)"}
                </span>
              )}
            </div>
          </div>
          {p.recommendationScore > 0 && (
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-400">
                {p.recommendationScore.toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-[#6B7280]">Notre note</div>
            </div>
          )}
        </div>

        <p className="mt-1 text-[11px] text-[#6B7280]">
          Notre estimation pour cette journée — pas la note MPG.
        </p>

        {status && p.recommendationScore === 0 && (
          <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">
            Écarté du onze : {status.toLowerCase()}.
          </p>
        )}

        {reasons.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
              Pourquoi cette note
            </p>
            <div className="space-y-1.5">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={r.positive ? "text-emerald-400" : "text-red-400"}>
                    {r.positive ? "▲" : "▼"}
                  </span>
                  <span className="text-[#F9FAFB]">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-[#1F4641] py-2.5 font-medium text-[#F9FAFB]"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
