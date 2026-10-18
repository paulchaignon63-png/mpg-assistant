/**
 * Notifications push (Web Push, clés VAPID).
 *
 * Un abonnement = un appareil, avec les ligues pour lesquelles il veut des
 * alertes (championnat + effectif). Rangé dans le stockage serveur.
 */
import webpush, { type PushSubscription } from "web-push";
import { createHash } from "node:crypto";
import { getStore } from "./store";

export interface PushLeague {
  id: string;
  name: string;
  championshipId: string;
  playerIds: string[];
  mode: "safe" | "balanced" | "poker";
}

export interface PushRecord {
  subscription: PushSubscription;
  leagues: Record<string, PushLeague>;
  createdAt: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export function pushEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@le11parfait.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export function subscriptionKey(endpoint: string): string {
  return `push:${createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}`;
}

/** Envoie une alerte ; supprime l'abonnement s'il n'existe plus (404/410). */
export async function sendPush(key: string, record: PushRecord, message: PushMessage): Promise<boolean> {
  configure();
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(message), { TTL: 6 * 3600 });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await getStore().delete(key);
    return false;
  }
}
