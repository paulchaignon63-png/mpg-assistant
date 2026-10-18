/**
 * POST /api/chat — « Pourquoi lui ? » : questions libres sur la compo.
 * Corps : { context: string (JSON de la compo), history: [{role, content}] }
 * Formule gratuite : CHAT_FREE_PER_DAY questions par jour et par appareil (5 par défaut).
 */
import { NextResponse } from "next/server";
import { aiEnabled, askCoach, type ChatTurn } from "@/lib/ai";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "Le chat n'est pas activé sur ce serveur (clé ANTHROPIC_API_KEY absente)." }, { status: 503 });
  }
  let body: { context?: string; history?: ChatTurn[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const history = (body.history ?? []).filter(
    (t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.length <= 1000
  );
  if (!body.context || body.context.length > 30000 || history.length === 0 || history.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Question manquante ou contexte trop long" }, { status: 400 });
  }
  const perDay = Number(process.env.CHAT_FREE_PER_DAY ?? 5);
  const limit = rateLimit(`chat:${clientKey(request)}`, perDay, 24 * 3600 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Tu as utilisé tes ${perDay} questions gratuites du jour. Reviens demain !` },
      { status: 429 }
    );
  }
  try {
    const answer = await askCoach(body.context, history);
    return NextResponse.json({ answer, remaining: limit.remaining });
  } catch {
    return NextResponse.json({ error: "Le chat ne répond pas pour le moment, réessaie dans un instant." }, { status: 502 });
  }
}
