/**
 * POST /api/import/screenshot — lit une capture d'écran d'effectif.
 * Corps : { image: base64 sans en-tête, mediaType: "image/png" | "image/jpeg" | "image/webp" }
 * Renvoie la liste des joueurs lus ; le rapprochement avec le vivier se fait
 * côté client (même règle que pour une liste collée).
 */
import { NextResponse } from "next/server";
import { aiEnabled, readSquadScreenshot } from "@/lib/ai";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "L'import par capture n'est pas activé sur ce serveur." }, { status: 503 });
  }
  let body: { image?: string; mediaType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!body.image || !body.mediaType || !TYPES.has(body.mediaType)) {
    return NextResponse.json({ error: "Envoie une image PNG, JPEG ou WebP." }, { status: 400 });
  }
  if (body.image.length > 7_000_000) {
    return NextResponse.json({ error: "Image trop lourde (5 Mo maximum)." }, { status: 413 });
  }
  if (!rateLimit(`shot:${clientKey(request)}`, 10, 3600 * 1000).ok) {
    return NextResponse.json({ error: "Trop d'imports en une heure, réessaie plus tard." }, { status: 429 });
  }
  try {
    const players = await readSquadScreenshot(body.image, body.mediaType as "image/png");
    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ error: "Impossible de lire cette capture." }, { status: 502 });
  }
}
