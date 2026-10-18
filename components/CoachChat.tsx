"use client";

import { useState } from "react";
import type { RecommendResult } from "@/lib/engine/recommend";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Pourquoi ce capitaine ?",
  "Quel titulaire est le plus risqué ?",
  "Mon banc est-il assez solide ?",
];

/** Contexte compact envoyé au chat : les chiffres du moteur, rien de plus. */
function buildContext(r: RecommendResult): string {
  return JSON.stringify({
    journee: r.round,
    formation: r.formation,
    mode: r.mode,
    noteEquipe: r.teamScore,
    totalAttendu: Math.round(r.stats.mean * 10) / 10,
    risqueRotaldo: Math.round(r.stats.rotaldoRate * 100),
    capitaine: r.players.find((p) => p.id === r.captainId)?.name,
    duel: r.matchup
      ? { victoire: Math.round(r.matchup.win * 100), nul: Math.round(r.matchup.draw * 100), defaite: Math.round(r.matchup.loss * 100) }
      : undefined,
    joueurs: r.players.map((p) => ({
      nom: p.name,
      poste: p.position,
      club: p.club,
      role: p.role === "starter" ? "titulaire" : p.role === "bench" ? `banc n°${p.benchOrder}` : "non retenu",
      titulaireProba: Math.round(p.pStart * 100),
      noteAttendue: Math.round(p.noteMean * 100) / 100,
      butsAttendus: Math.round(p.goalRate * 100) / 100,
      statut: p.status,
      adversaire: p.opponentName ? `${p.opponentName}${p.isHome ? " (dom.)" : " (ext.)"}, ${p.opponentRank}e` : undefined,
      facteurs: p.reasons.map((x) => x.label),
    })),
    remplacementsTactiques: r.tacticalSubs.map((s) => `${s.out.name} → ${s.in.name} : ${s.reason}`),
  });
}

export function CoachChat({ result, onClose }: { result: RecommendResult; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(history);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: buildContext(result), history }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Pas de réponse.");
      else setTurns([...history, { role: "assistant", content: d.answer }]);
    } catch {
      setError("Pas de réponse, vérifie ta connexion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-line bg-card p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Questions sur ta compo"
      >
        <div className="mx-auto w-full max-w-md">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-fg">Pourquoi lui ?</h2>
            <button onClick={onClose} className="text-sm text-muted">
              Fermer
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md flex-1 space-y-2 overflow-y-auto">
          {turns.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Pose une question sur ta compo : l&apos;assistant répond à partir des chiffres du moteur.</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="block w-full rounded-lg bg-chip px-3 py-2 text-left text-sm text-fg">
                  {s}
                </button>
              ))}
            </div>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                t.role === "user" ? "ml-8 bg-emerald-600 text-white" : "mr-8 bg-bg text-fg"
              }`}
            >
              {t.content}
            </div>
          ))}
          {busy && <div className="mr-8 animate-pulse rounded-xl bg-bg px-3 py-2 text-sm text-muted">Réflexion…</div>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <form
          className="mx-auto mt-3 flex w-full max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="Sima ou Hamdani ?"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder-subtle focus:outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-40">
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}
