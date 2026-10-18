/**
 * GET /api/precision — la précision du 11 parfait, publiée :
 *  - le banc d'essai (journées passées rejouées, hors échantillon) ;
 *  - le suivi réel journée après journée (pronostics figés avant le match) ;
 *  - la fiabilité mesurée des sources de compos probables.
 */
import { NextResponse } from "next/server";
import backtest from "@/lib/engine/model/backtest-summary.json";
import { COEFFICIENTS } from "@/lib/engine/model";
import { getSupportedChampionships } from "@/lib/championships";
import { getStore } from "@/lib/store";
import { accuracyKey, type SourceAccuracy } from "@/lib/sources/lineups";
import type { RoundPrecision } from "@/lib/precision";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const championships = await Promise.all(
    getSupportedChampionships().map(async (c) => ({
      id: c.id,
      name: c.name,
      countryCode: c.countryCode,
      backtest: (backtest as Record<string, unknown>)[c.id] ?? null,
      live: ((await store.get<RoundPrecision[]>(`precision:${c.id}`).catch(() => null)) ?? []).slice(-20),
      rotowire: await store.get<SourceAccuracy>(accuracyKey("rotowire", c.id)).catch(() => null),
    }))
  );
  return NextResponse.json({
    model: { version: COEFFICIENTS.version, trainedAt: COEFFICIENTS.trainedAt, samples: COEFFICIENTS.samples },
    championships,
  });
}
