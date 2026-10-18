"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { RecommendResult, SquadPlayer } from "@/lib/engine/recommend";
import { formatFormation } from "@/lib/engine/mpg-rules";
import { savePrediction, type LeagueMode } from "@/lib/manual-league";
import { useLeague, notifyLeagues } from "@/lib/client/use-league";
import { useFeatures } from "@/lib/client/use-features";
import { shortName } from "@/lib/names";
import { PlayerToken, bandColor, bandLabel } from "@/components/PlayerToken";
import { Sparkline } from "@/components/Sparkline";
import { CoachChat } from "@/components/CoachChat";

const POS_ORDER: Array<"G" | "D" | "M" | "A"> = ["G", "D", "M", "A"];
const LINE_TOP: Record<string, number> = { A: 13, M: 38, D: 63, G: 86 };
const MODES: Array<{ key: LeagueMode; label: string; hint: string }> = [
  { key: "safe", label: "Sûr", hint: "Privilégie les titulaires certains" },
  { key: "balanced", label: "Équilibré", hint: "Meilleure espérance de points" },
  { key: "poker", label: "Coup de poker", hint: "Vise le plus haut plafond" },
];

function tagFor(p: SquadPlayer): { label: string; tone: string } | null {
  if (p.status === "injured") return { label: "BLE", tone: "bg-red-600 text-white" };
  if (p.status === "suspended") return { label: "SUS", tone: "bg-red-600 text-white" };
  if (p.status === "out") return { label: "HG", tone: "bg-red-600 text-white" };
  if (p.status === "doubtful") return { label: "INC", tone: "bg-amber-500 text-black" };
  if (p.midweek) return { label: "EUR", tone: "bg-violet-500 text-white" };
  if (p.yellowRisk) return { label: "J", tone: "bg-yellow-400 text-black" };
  return null;
}

function kickoffText(ts: number): string {
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countdown(ts: number, now: number): string {
  const s = Math.max(0, ts - now / 1000);
  if (s <= 0) return "journée en cours";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} j ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function OnzePage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [league, update] = useLeague(leagueId);
  const features = useFeatures();
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Clé de calcul : tout ce qui change la compo.
  const requestKey = league
    ? JSON.stringify({
        c: league.championshipId,
        p: league.playerIds,
        m: league.mode,
        f: league.formation,
        o: league.overrides,
      })
    : null;

  useEffect(() => {
    if (!requestKey || !league) return;
    let cancelled = false;
    fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        championshipId: league.championshipId,
        playerIds: league.playerIds,
        mode: league.mode,
        formation: league.formation,
        overrides: league.overrides,
      }),
    })
      .then((r) => r.json())
      .then((d: RecommendResult & { error?: string }) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
          return;
        }
        setError(null);
        setResult(d);
        setResultKey(requestKey);
        // Pronostic figé pour le bilan d'après-journée.
        savePrediction(leagueId, {
          seasonRound: `${league.championshipId}:${d.round}`,
          round: d.round,
          savedAt: Date.now(),
          formation: d.formation,
          teamMean: d.stats.mean,
          captainId: d.captainId,
          starters: d.players.filter((p) => p.role === "starter").map((p) => p.id),
          bench: d.players.filter((p) => p.role === "bench").sort((a, b) => (a.benchOrder ?? 0) - (b.benchOrder ?? 0)).map((p) => p.id),
          players: Object.fromEntries(
            d.players.map((p) => [
              p.id,
              { noteMean: p.noteMean, pStart: p.pStart, value: p.value, name: p.name, position: p.position },
            ])
          ),
        });
        notifyLeagues();
      })
      .catch(() => !cancelled && setError("Impossible de calculer le 11. Vérifie ta connexion."));
    return () => {
      cancelled = true;
    };
    // league est lu via requestKey, qui en résume tous les champs utiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, leagueId]);

  const loading = !!league && !result && !error;
  const recomputing = !!result && resultKey !== requestKey && !error;
  const players = useMemo(() => result?.players ?? [], [result]);
  const starters = players.filter((p) => p.role === "starter");
  const bench = players.filter((p) => p.role === "bench").sort((a, b) => (a.benchOrder ?? 0) - (b.benchOrder ?? 0));
  const unavailable = players.filter((p) => p.role !== "starter" && ["injured", "suspended", "out"].includes(p.status));
  const selected = players.find((p) => p.id === selectedId) ?? null;
  const bestFormation = result?.formations.filter((f) => !f.incomplete).sort((a, b) => b.mean - a.mean)[0]?.formation;

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
    <div className="min-h-screen px-4 pb-20 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link href={`/ligue/${leagueId}`} className="mb-4 inline-block text-sm text-muted hover:text-fg">
          ← {league?.name ?? "Retour"}
        </Link>

        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg">Ta compo{result ? ` · J${result.round}` : ""}</h1>
            <p className="text-sm text-muted">
              {result?.firstKickoff
                ? `1er match ${kickoffText(result.firstKickoff)} · clôture dans ${countdown(result.firstKickoff, now)}`
                : "Ton meilleur onze"}
            </p>
          </div>
        </div>

        {/* Résumé : note d'équipe + phrase */}
        {result && (
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-card p-4">
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--chip)" strokeWidth="3.5" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(result.teamScore / 100) * 97.4} 97.4`}
                />
              </svg>
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold leading-none text-fg tabular-nums">{result.teamScore}</span>
                <span className="text-[9px] text-subtle">/100</span>
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-fg">{result.summary}</p>
              <p className="mt-1 text-xs text-subtle tabular-nums">
                Total attendu {result.stats.mean.toFixed(1)} pts · fourchette {result.stats.p10.toFixed(0)}–{result.stats.p90.toFixed(0)}
              </p>
            </div>
          </div>
        )}

        {/* Mode de jeu */}
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-chip p-1" role="radiogroup" aria-label="Mode de jeu">
          {MODES.map((m) => (
            <button
              key={m.key}
              role="radio"
              aria-checked={league?.mode === m.key}
              title={m.hint}
              onClick={() => update({ mode: m.key })}
              className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                league?.mode === m.key ? "bg-card text-fg shadow" : "text-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Formations avec leur total attendu */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => update({ formation: "auto" })}
            className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${
              league?.formation === "auto" ? "bg-emerald-600 text-white" : "bg-chip text-muted"
            }`}
          >
            Auto{league?.formation === "auto" && result ? ` · ${formatFormation(result.formation)}` : ""}
          </button>
          {result?.formations.map((f) => (
            <button
              key={f.formation}
              onClick={() => update({ formation: f.formation })}
              disabled={f.incomplete}
              className={`shrink-0 rounded-full px-3 py-1 text-sm tabular-nums transition disabled:opacity-35 ${
                league?.formation === f.formation ? "bg-emerald-600 text-white" : "bg-chip text-muted"
              }`}
              title={f.incomplete ? "Pas assez de joueurs pour cette formation" : `Entre ${f.p10.toFixed(0)} et ${f.p90.toFixed(0)} pts`}
            >
              {formatFormation(f.formation)} · {f.mean.toFixed(1)}
              {f.formation === bestFormation && <span className="ml-1 text-accent">★</span>}
            </button>
          ))}
        </div>

        {loading && <div className="mt-3 aspect-[3/4] w-full animate-pulse rounded-2xl bg-card" />}
        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-danger">{error}</p>
        )}

        {recomputing && <p className="mt-2 text-center text-xs text-subtle">Recalcul de la compo…</p>}
        {result && (
          <div className={recomputing ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {/* Terrain */}
            <div
              className="relative mt-3 w-full max-w-full overflow-hidden rounded-2xl border border-line"
              style={{ aspectRatio: "3 / 4", background: "repeating-linear-gradient(180deg, #14532d 0 12.5%, #166534 12.5% 25%)" }}
            >
              <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-white/20" />
              <div className="pointer-events-none absolute left-2 right-2 top-1/2 border-t-2 border-white/20" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
              <div className="pointer-events-none absolute left-1/2 top-2 h-14 w-28 -translate-x-1/2 border-2 border-t-0 border-white/20" />
              <div className="pointer-events-none absolute bottom-2 left-1/2 h-14 w-28 -translate-x-1/2 border-2 border-b-0 border-white/20" />
              {POS_ORDER.map((pos) => {
                const line = starters.filter((p) => p.position === pos);
                return line.map((p, i) => {
                  const tag = tagFor(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                      style={{ top: `${LINE_TOP[pos]}%`, left: `${((i + 1) / (line.length + 1)) * 100}%` }}
                      aria-label={`${p.name}, note attendue ${p.noteMean.toFixed(1)}, titulaire à ${Math.round(p.pStart * 100)} %`}
                    >
                      <PlayerToken club={p.club} pStart={p.pStart} captain={p.id === result.captainId} note={p.noteMean} size={38} />
                      <span className="mt-0.5 flex max-w-[84px] items-center gap-0.5 rounded bg-black/55 px-1 text-[11px] font-medium text-white">
                        <span className="truncate">{shortName(p.name)}</span>
                        {tag && <span className={`rounded px-0.5 text-[8px] font-bold ${tag.tone}`}>{tag.label}</span>}
                      </span>
                    </button>
                  );
                });
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-subtle">
              {[0.95, 0.75, 0.5, 0.2].map((v) => (
                <span key={v} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: bandColor(v) }} />
                  {bandLabel(v)}
                </span>
              ))}
            </div>

            {/* Banc ordonné */}
            {bench.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-1 text-sm font-bold text-fg">Banc, dans l&apos;ordre</h2>
                <p className="mb-2 text-xs text-subtle">
                  Si un titulaire ne joue pas, MPG fait entrer le premier remplaçant de son poste qui a joué.
                  {result.stats.rotaldoRate >= 0.05 &&
                    ` Risque d'aligner Rotaldo (2,5) : ${Math.round(result.stats.rotaldoRate * 100)} %.`}
                </p>
                <div className="space-y-1.5">
                  {bench.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-line bg-card px-2 py-1.5 text-left"
                    >
                      <span className="w-4 text-center text-xs font-bold text-subtle tabular-nums">{p.benchOrder}</span>
                      <PlayerToken club={p.club} pStart={p.pStart} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{p.name}</span>
                        <span className="block text-[11px] text-subtle">
                          {p.position} · titulaire {Math.round(p.pStart * 100)} %
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-fg tabular-nums">{p.noteMean.toFixed(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Remplacements tactiques */}
            {result.tacticalSubs.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-1 text-sm font-bold text-fg">Remplacements tactiques</h2>
                <p className="mb-3 text-xs text-subtle">Des suggestions, pas des obligations. Touche « ? » pour le pourquoi.</p>
                <div className="space-y-2">
                  {result.tacticalSubs.map((s, i) => (
                    <div key={`${s.out.id}-${s.in.id}`} className="rounded-xl border border-line bg-card p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg">{shortName(s.out.name)}</span>
                        <span className="shrink-0 text-accent">→</span>
                        <span className="min-w-0 flex-1 truncate text-fg">{shortName(s.in.name)}</span>
                        {s.threshold != null && (
                          <span className="shrink-0 rounded bg-chip px-1.5 py-0.5 text-[11px] text-muted tabular-nums">si note &lt; {s.threshold}</span>
                        )}
                        <button
                          onClick={() => setOpenSub(openSub === i ? null : i)}
                          aria-label="Pourquoi cette suggestion"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            openSub === i ? "bg-emerald-500 text-on-accent" : "bg-chip text-muted"
                          }`}
                        >
                          ?
                        </button>
                      </div>
                      {openSub === i && (
                        <p className="mt-2 border-t border-line pt-2 text-sm text-fg">
                          <span
                            className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              s.kind === "securite" ? "bg-amber-400/15 text-warn" : s.kind === "filet" ? "bg-violet-400/15 text-violet" : "bg-sky-400/15 text-info"
                            }`}
                          >
                            {s.kind === "securite" ? "Sécurité" : s.kind === "filet" ? "Filet" : "Alternative"}
                          </span>
                          {s.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unavailable.length > 0 && (
              <div className="mt-5">
                <h2 className="mb-2 text-sm font-bold text-fg">Indisponibles</h2>
                <div className="flex flex-wrap gap-1.5">
                  {unavailable.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs text-danger"
                    >
                      {shortName(p.name)} · {p.statusLabel ?? (p.status === "suspended" ? "suspendu" : p.status === "out" ? "hors groupe" : "blessé")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {features?.chat && (
              <button
                onClick={() => setChatOpen(true)}
                className="mt-6 w-full rounded-lg border border-emerald-500/40 bg-emerald-600/10 py-2.5 text-sm font-medium text-accent"
              >
                Pose une question sur ta compo
              </button>
            )}

            <p className="mt-6 text-center text-[11px] leading-relaxed text-subtle">
              Compos : {result.lineupSources.length ? result.lineupSources.map((s) => `${s.source} (${s.clubs} clubs)`).join(", ") : "pas encore publiées"}
              {" · "}Cotes : {result.oddsAvailable.matchOdds ? "bookmakers via MPGStats" : "indisponibles"}
              {result.oddsAvailable.scorerOdds ? " + cotes buteur" : ""}
              {" · "}Modèle {result.modelVersion} ·{" "}
              <Link href="/precision" className="underline">
                notre précision
              </Link>
            </p>
          </div>
        )}
      </div>

      {selected && result && league && (
        <PlayerSheet
          p={selected}
          captain={selected.id === result.captainId}
          alternative={players
            .filter((x) => x.position === selected.position && x.id !== selected.id && x.role !== "out")
            .sort((a, b) => b.value - a.value)[0]}
          override={league.overrides[selected.id]}
          onOverride={(v) => {
            const next = { ...league.overrides };
            if (v == null) delete next[selected.id];
            else next[selected.id] = v;
            update({ overrides: next });
          }}
          onClose={() => setSelectedId(null)}
        />
      )}

      {chatOpen && result && <CoachChat result={result} onClose={() => setChatOpen(false)} />}
    </div>
  );
}

function PlayerSheet({
  p,
  captain,
  alternative,
  override,
  onOverride,
  onClose,
}: {
  p: SquadPlayer;
  captain: boolean;
  alternative?: SquadPlayer;
  override?: number;
  onOverride: (v: number | undefined) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(Math.round((override ?? p.pStart) * 100));
  const base = p.explanation.find((e) => e.term === "base");
  const factors = p.explanation.filter((e) => e.term !== "base");
  const modelTotal = p.explanation.reduce((a, e) => a + e.value, 0);
  const adjustment = p.noteMean - Math.min(8.5, Math.max(3, modelTotal));
  const diff = alternative ? p.value - alternative.value : null;

  return (
    <div className="fixed inset-0 z-20 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-line bg-card p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={p.name}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-chip-strong" />
        <div className="mx-auto max-w-md">
          <div className="flex items-center gap-3">
            <PlayerToken club={p.club} pStart={p.pStart} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-bold text-fg">{p.name}</span>
                {captain && <span className="rounded bg-amber-400 px-1.5 text-[11px] font-bold text-black">Capitaine</span>}
              </div>
              <div className="truncate text-sm text-muted">
                {p.club} · {p.detailedPosition || p.position}
                {p.quotation != null && ` · cote ${p.quotation}`}
                {p.opponentName && (
                  <span className="text-subtle">
                    {" → "}
                    {p.opponentName} {p.isHome ? "(dom.)" : "(ext.)"}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-accent tabular-nums">{p.noteMean.toFixed(1)}</div>
              <div className="text-[10px] uppercase tracking-wide text-subtle">note attendue</div>
            </div>
          </div>

          {/* Titularisation */}
          <div className="mt-4 rounded-xl bg-bg p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-fg">{bandLabel(p.pStart)}</span>
              <span className="text-sm tabular-nums text-fg">{Math.round(p.pStart * 100)} %</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip">
              <div className="h-full rounded-full" style={{ width: `${p.pStart * 100}%`, background: bandColor(p.pStart) }} />
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">
              Sources : modèle{p.signals.length ? `, ${p.signals.join(", ")}` : ""}. Probabilité d&apos;être noté : {Math.round(p.pPlay * 100)} %.
            </p>
            <label htmlFor="override" className="mt-3 block text-xs font-medium text-muted">
              Et si… tu sais mieux ? Ta probabilité de titularisation : {draft} %
            </label>
            <input
              id="override"
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value))}
              className="mt-1 w-full accent-emerald-500"
            />
            <div className="mt-1 flex gap-2">
              <button onClick={() => onOverride(draft / 100)} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white">
                Recalculer la compo
              </button>
              {override != null && (
                <button onClick={() => onOverride(undefined)} className="flex-1 rounded-lg bg-chip py-1.5 text-xs text-fg">
                  Revenir au calcul
                </button>
              )}
            </div>
          </div>

          {/* Forme */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">5 derniers matchs</p>
              <p className="text-[11px] text-subtle">× = absent ou non noté</p>
            </div>
            <Sparkline notes={p.lastNotes} />
          </div>

          {/* Décomposition */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">D&apos;où vient la note attendue</p>
            <div className="space-y-1 text-sm tabular-nums">
              {base && (
                <div className="flex justify-between text-muted">
                  <span>{base.label}</span>
                  <span>{base.value.toFixed(2)}</span>
                </div>
              )}
              {factors.map((f) => (
                <div key={f.term} className="flex justify-between">
                  <span className="text-fg">{f.label}</span>
                  <span className={f.value >= 0 ? "text-accent" : "text-danger"}>
                    {f.value >= 0 ? "+" : "−"}
                    {Math.abs(f.value).toFixed(2)}
                  </span>
                </div>
              ))}
              {Math.abs(adjustment) >= 0.01 && (
                <div className="flex justify-between">
                  <span className="text-fg">Clean sheet selon les cotes</span>
                  <span className={adjustment >= 0 ? "text-accent" : "text-danger"}>
                    {adjustment >= 0 ? "+" : "−"}
                    {Math.abs(adjustment).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1 font-semibold text-fg">
                <span>Note attendue s&apos;il joue</span>
                <span>{p.noteMean.toFixed(2)}</span>
              </div>
              {p.goalRate > 0.02 && (
                <div className="flex justify-between text-muted">
                  <span>Chances de marquer s&apos;il joue</span>
                  <span>{Math.round((1 - Math.exp(-p.goalRate)) * 100)} %</span>
                </div>
              )}
              {p.cleanSheetProb != null && (p.position === "G" || p.position === "D") && (
                <div className="flex justify-between text-muted">
                  <span>Clean sheet (bookmakers)</span>
                  <span>{Math.round(p.cleanSheetProb * 100)} %</span>
                </div>
              )}
            </div>
          </div>

          {alternative && diff != null && (
            <p className="mt-3 rounded-lg bg-bg p-2.5 text-sm text-fg">
              Face à {shortName(alternative.name)} ({alternative.role === "starter" ? "titulaire" : "remplaçant"}) :{" "}
              <span className={diff >= 0 ? "text-accent" : "text-danger"}>
                {diff >= 0 ? "+" : "−"}
                {Math.abs(diff).toFixed(2)} pt
              </span>{" "}
              de valeur attendue.
            </p>
          )}

          {p.reasons.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {p.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={r.positive ? "text-accent" : "text-danger"}>{r.positive ? "▲" : "▼"}</span>
                  <span className="text-fg">{r.label}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={onClose} className="mt-6 w-full rounded-lg bg-chip py-2.5 font-medium text-fg">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
