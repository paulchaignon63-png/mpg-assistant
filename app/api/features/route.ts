/** GET /api/features — fonctions activées sur ce serveur (selon les clés configurées). */
import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { oddsApiEnabled } from "@/lib/sources/odds-api";

export function GET() {
  return NextResponse.json({
    chat: aiEnabled(),
    screenshotImport: aiEnabled(),
    scorerOdds: oddsApiEnabled(),
    push: !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}
