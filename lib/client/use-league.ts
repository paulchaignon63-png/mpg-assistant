"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getLeague, updateLeague, type ManualLeague } from "@/lib/manual-league";

/*
 * Lecture réactive d'une ligue stockée sur l'appareil, sans setState dans un
 * effet : on s'abonne au stockage local et on relit à chaque modification.
 */
const listeners = new Set<() => void>();
const snapshots = new Map<string, { raw: string | null; value: ManualLeague | null }>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener("leagues-changed", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("leagues-changed", onStorage);
  };
}

function notify() {
  for (const l of listeners) l();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("leagues-changed"));
}

function read(id: string): ManualLeague | null {
  const league = getLeague(id) ?? null;
  const raw = league ? JSON.stringify(league) : null;
  const prev = snapshots.get(id);
  if (prev && prev.raw === raw) return prev.value;
  snapshots.set(id, { raw, value: league });
  return league;
}

/** `undefined` pendant le rendu serveur, `null` si la ligue n'existe pas. */
export function useLeague(id: string): [ManualLeague | null | undefined, (patch: Parameters<typeof updateLeague>[1]) => void] {
  const league = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => undefined
  );
  const update = useCallback(
    (patch: Parameters<typeof updateLeague>[1]) => {
      updateLeague(id, patch);
      notify();
    },
    [id]
  );
  return [league, update];
}

export { notify as notifyLeagues };
