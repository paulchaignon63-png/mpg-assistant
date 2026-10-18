/**
 * POST /api/crowd — signalement de la communauté pour la prochaine journée :
 * « titulaire », « remplaçant » ou « absent ». Les votes deviennent une
 * source de compos probables, pondérée par leur nombre.
 *
 * Corps : { championshipId, playerId, vote: "start" | "bench" | "out" }
 */
import { NextResponse } from "next/server";
import { getRoundData } from "@/lib/engine/recommend";
import { crowdKey, type CrowdVotes } from "@/lib/sources/lineups";
import { getStore, storeIsDurable } from "@/lib/store";

const VOTES = new Set(["start", "bench", "out"]);

export async function POST(request: Request) {
  if (!storeIsDurable()) {
    return NextResponse.json({ error: "Stockage serveur non configuré (Supabase)." }, { status: 503 });
  }
  let body: { championshipId?: string; playerId?: string; vote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { championshipId, playerId, vote } = body;
  if (!championshipId || !playerId || !vote || !VOTES.has(vote)) {
    return NextResponse.json({ error: "Vote invalide" }, { status: 400 });
  }
  const data = await getRoundData(championshipId);
  if (!data || !data.snapshot.players.some((p) => p.id === playerId)) {
    return NextResponse.json({ error: "Joueur inconnu" }, { status: 404 });
  }
  const key = crowdKey(championshipId, data.snapshot.currentSeasonId, data.round);
  const store = getStore();
  const votes = (await store.get<CrowdVotes>(key)) ?? {};
  const v = votes[playerId] ?? { start: 0, bench: 0, out: 0 };
  v[vote as "start" | "bench" | "out"]++;
  votes[playerId] = v;
  await store.set(key, votes);
  return NextResponse.json({ ok: true, votes: v, round: data.round });
}
