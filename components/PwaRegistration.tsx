"use client";

import { useEffect } from "react";

/** Enregistre le service worker pour activer l'installation PWA (icône custom, mode standalone) */
export function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {});
  }, []);
  return null;
}
