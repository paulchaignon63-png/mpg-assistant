/**
 * POST /api/recommendations — le 11 recommandé pour un effectif.
 *
 * Corps : { championshipId, playerIds, mode?, formation?, overrides?,
 *           opponentIds?, opponentCheatCode? }
 * Aucune authentification MPG : tout vient de MPGStats et des sources
 * publiques (compos probables, cotes).
 */
import { NextResponse } from "next/server";
import { recommend, type RecommendInput } from "@/lib/engine/recommend";
import { getSupportedChampionships } from "@/lib/championships";
import { AVAILABLE_FORMATIONS } from "@/lib/engine/mpg-rules";

export const maxDuration = 30;

const MODES = new Set(["safe", "balanced", "poker"]);

export async function POST(request: Request) {
  let body: Partial<RecommendInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { championshipId, playerIds } = body;
  if (!championshipId || !getSupportedChampionships().some((c) => c.id === championshipId)) {
    return NextResponse.json({ error: "Championnat non supporté" }, { status: 400 });
  }
  if (!Array.isArray(playerIds) || playerIds.length === 0 || playerIds.length > 40) {
    return NextResponse.json({ error: "Effectif vide ou trop grand" }, { status: 400 });
  }
  const formation =
    typeof body.formation === "number" && (AVAILABLE_FORMATIONS as readonly number[]).includes(body.formation)
      ? body.formation
      : "auto";
  const overrides: Record<string, number> = {};
  for (const [id, v] of Object.entries(body.overrides ?? {})) {
    if (typeof v === "number" && v >= 0 && v <= 1) overrides[id] = v;
  }

  try {
    const result = await recommend({
      championshipId,
      playerIds: playerIds.map(String),
      mode: MODES.has(String(body.mode)) ? (body.mode as RecommendInput["mode"]) : "balanced",
      formation,
      overrides,
      opponentIds: Array.isArray(body.opponentIds) ? body.opponentIds.map(String).slice(0, 40) : undefined,
      opponentCheatCode: body.opponentCheatCode === true,
    });
    if ("error" in result) return NextResponse.json(result, { status: 502 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Erreur lors du calcul de la compo" }, { status: 500 });
  }
}
