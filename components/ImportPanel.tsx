"use client";

import { useState } from "react";
import type { RosterPlayer } from "@/lib/manual-league";
import { parseLeagueCode } from "@/lib/manual-league";
import { resolveEntriesToPlayers } from "@/lib/player-matching";
import { useFeatures } from "@/lib/client/use-features";

type Tab = "paste" | "screenshot" | "code";

/** Rapproche des noms libres (liste collée, capture) du vivier du championnat. */
export function matchNames(pool: RosterPlayer[], entries: Array<{ name: string; club?: string }>) {
  const refs = pool.map((p) => ({ name: p.name, clubName: p.club }));
  const resolved = resolveEntriesToPlayers(
    refs,
    entries.map((e) => ({ playerName: e.name, clubName: e.club }))
  );
  const ids = new Set([...resolved.keys()].map((i) => pool[i].id));
  const matchedNames = new Set([...resolved.values()].map((e) => e.playerName));
  const missing = entries.map((e) => e.name).filter((n) => !matchedNames.has(n));
  return { ids: [...ids], missing };
}

/**
 * Import rapide d'un effectif : liste de noms collée, capture d'écran lue par
 * l'IA ou code de partage d'une autre ligue.
 */
export function ImportPanel({
  pool,
  onImport,
  title = "Importer ton effectif",
}: {
  pool: RosterPlayer[];
  title?: string;
  onImport: (ids: string[]) => void;
}) {
  const features = useFeatures();
  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function finish(ids: string[], missing: string[]) {
    if (ids.length === 0) {
      setMessage("Aucun joueur reconnu. Vérifie l'orthographe ou le championnat de la ligue.");
      return;
    }
    onImport(ids);
    setMessage(
      `${ids.length} joueur${ids.length > 1 ? "s" : ""} ajouté${ids.length > 1 ? "s" : ""}.` +
        (missing.length ? ` Non reconnus : ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}.` : "")
    );
  }

  function importText() {
    const entries = text
      .split(/\n|;|,(?![^(]*\))/)
      .map((l) => l.replace(/^[\s\d.\-–•*]+/, "").replace(/\(.*?\)/g, "").trim())
      .filter((l) => l.length >= 3)
      .map((name) => ({ name }));
    const { ids, missing } = matchNames(pool, entries);
    finish(ids, missing);
  }

  async function importScreenshot(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const [, mediaType, image] = dataUrl.match(/^data:(image\/[a-z]+);base64,(.*)$/) ?? [];
      const res = await fetch("/api/import/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, mediaType }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMessage(d.error ?? "Lecture impossible.");
        return;
      }
      const { ids, missing } = matchNames(pool, d.players ?? []);
      finish(ids, missing);
    } catch {
      setMessage("Lecture de la capture impossible.");
    } finally {
      setBusy(false);
    }
  }

  function importCode() {
    const parsed = parseLeagueCode(code);
    if (!parsed) {
      setMessage("Code invalide.");
      return;
    }
    const known = new Set(pool.map((p) => p.id));
    const ids = parsed.playerIds.filter((id) => known.has(id));
    finish(ids, []);
  }

  const tabs: Array<{ key: Tab; label: string; hidden?: boolean }> = [
    { key: "paste", label: "Coller une liste" },
    { key: "screenshot", label: "Capture d'écran", hidden: !features?.screenshotImport },
    { key: "code", label: "Code de partage" },
  ];

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-fg">{title}</h2>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setMessage(null);
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${tab === t.key ? "bg-emerald-600 text-white" : "bg-chip text-muted"}`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === "paste" && (
        <div className="space-y-2">
          <textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"Un joueur par ligne :\nHakimi\nGouiri\nJeffrey de Lange…"}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder-subtle focus:border-emerald-500/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={importText}
            disabled={!text.trim()}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Ajouter ces joueurs
          </button>
        </div>
      )}

      {tab === "screenshot" && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-chip-strong p-5 text-center text-sm text-muted">
          <span>{busy ? "Lecture de la capture…" : "Choisis une capture de ton effectif MPG"}</span>
          <span className="text-xs text-subtle">L&apos;image est lue par une IA puis oubliée.</span>
          <input
            id="import-shot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importScreenshot(f);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {tab === "code" && (
        <div className="space-y-2">
          <input
            id="import-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Colle le code de partage d'une ligue"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={importCode}
            disabled={!code.trim()}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Importer
          </button>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </div>
  );
}
