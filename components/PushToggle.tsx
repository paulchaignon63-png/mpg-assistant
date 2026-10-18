"use client";

import { useEffect, useState } from "react";
import type { ManualLeague } from "@/lib/manual-league";
import { useFeatures } from "@/lib/client/use-features";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const KEY = (id: string) => `push_on:${id}`;

/**
 * Active les alertes d'une ligue sur cet appareil : compo prête la veille,
 * compos officielles (titulaire sur le banc), blessure d'un titulaire,
 * probabilité de titularisation qui change nettement.
 */
export function PushToggle({ league }: { league?: ManualLeague }) {
  const features = useFeatures();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!league) return;
    try {
      // Lecture d'une préférence locale au montage.
      setOn(localStorage.getItem(KEY(league.id)) === "1");
    } catch {
      /* stockage bloqué */
    }
  }, [league]);

  // Tient l'abonnement serveur à jour quand l'effectif change.
  useEffect(() => {
    if (!on || !league) return;
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return;
        return fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            league: { id: league.id, name: league.name, championshipId: league.championshipId, playerIds: league.playerIds, mode: league.mode },
          }),
        });
      })
      .catch(() => undefined);
  }, [on, league]);

  if (!features?.push || !league) return null;
  if (typeof window !== "undefined" && !("PushManager" in window)) {
    return (
      <p className="rounded-lg bg-card p-3 text-xs text-muted">
        Les alertes demandent d&apos;installer l&apos;app sur l&apos;écran d&apos;accueil (sur iPhone : Partager → Sur l&apos;écran d&apos;accueil).
      </p>
    );
  }

  async function enable() {
    if (!league || !features?.vapidPublicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Notifications refusées : autorise-les dans les réglages du navigateur.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(features.vapidPublicKey) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          league: { id: league.id, name: league.name, championshipId: league.championshipId, playerIds: league.playerIds, mode: league.mode },
        }),
      });
      if (!res.ok) {
        setMessage((await res.json()).error ?? "Activation impossible.");
        return;
      }
      localStorage.setItem(KEY(league.id), "1");
      setOn(true);
    } catch {
      setMessage("Activation impossible sur ce navigateur.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!league) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, leagueId: league.id }),
        });
      }
      localStorage.removeItem(KEY(league.id));
      setOn(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">Alertes</p>
          <p className="text-xs text-muted">Compo prête, compos officielles, blessures, titularisation qui change.</p>
        </div>
        <button
          onClick={on ? disable : enable}
          disabled={busy}
          role="switch"
          aria-checked={on}
          aria-label="Alertes de la ligue"
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-600" : "bg-chip-strong"} disabled:opacity-50`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-danger">{message}</p>}
    </div>
  );
}
