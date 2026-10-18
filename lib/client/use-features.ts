"use client";

import { useEffect, useState } from "react";

export interface Features {
  chat: boolean;
  screenshotImport: boolean;
  scorerOdds: boolean;
  push: boolean;
  vapidPublicKey: string | null;
  mpgImport: boolean;
}

let cached: Promise<Features | null> | null = null;

/** Fonctions activées côté serveur (chat, import par capture, alertes push…). */
export function useFeatures(): Features | null {
  const [features, setFeatures] = useState<Features | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/features")
      .then((r) => (r.ok ? (r.json() as Promise<Features>) : null))
      .catch(() => null);
    let alive = true;
    cached.then((f) => alive && setFeatures(f));
    return () => {
      alive = false;
    };
  }, []);
  return features;
}
