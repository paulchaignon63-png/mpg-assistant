/**
 * POST   /api/push/subscribe — active les alertes d'une ligue sur cet appareil.
 *        Corps : { subscription, league: { id, name, championshipId, playerIds, mode } }
 * DELETE /api/push/subscribe — les désactive. Corps : { endpoint, leagueId }
 */
import { NextResponse } from "next/server";
import { pushEnabled, sendPush, subscriptionKey, type PushLeague, type PushRecord } from "@/lib/push";
import { getStore, storeIsDurable } from "@/lib/store";

export async function POST(request: Request) {
  if (!pushEnabled()) return NextResponse.json({ error: "Alertes non configurées sur ce serveur." }, { status: 503 });
  if (!storeIsDurable()) return NextResponse.json({ error: "Stockage serveur non configuré (Supabase)." }, { status: 503 });
  let body: { subscription?: PushRecord["subscription"]; league?: PushLeague };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const sub = body.subscription;
  const league = body.league;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || !league?.id || !Array.isArray(league.playerIds)) {
    return NextResponse.json({ error: "Abonnement invalide" }, { status: 400 });
  }
  const store = getStore();
  const key = subscriptionKey(sub.endpoint);
  const existing = await store.get<PushRecord>(key);
  const record: PushRecord = {
    subscription: sub,
    leagues: {
      ...(existing?.leagues ?? {}),
      [league.id]: {
        id: league.id,
        name: String(league.name).slice(0, 60),
        championshipId: String(league.championshipId),
        playerIds: league.playerIds.slice(0, 40).map(String),
        mode: league.mode ?? "balanced",
      },
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await store.set(key, record);
  if (!existing) {
    await sendPush(key, record, {
      title: "Alertes activées",
      body: `Tu seras prévenu pour « ${record.leagues[league.id].name} » : compo prête, compos officielles, blessures.`,
      url: `/ligue/${league.id}/onze`,
      tag: "welcome",
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: { endpoint?: string; leagueId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "endpoint manquant" }, { status: 400 });
  const store = getStore();
  const key = subscriptionKey(body.endpoint);
  const record = await store.get<PushRecord>(key);
  if (!record) return NextResponse.json({ ok: true });
  if (body.leagueId) delete record.leagues[body.leagueId];
  if (!body.leagueId || Object.keys(record.leagues).length === 0) await store.delete(key);
  else await store.set(key, record);
  return NextResponse.json({ ok: true });
}
