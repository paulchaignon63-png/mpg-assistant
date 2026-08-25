/**
 * Vivier des joueurs d'un championnat, pour composer un effectif à la main.
 *
 * Aucune authentification MPG : la liste vient de MPGStats (joignable depuis Vercel).
 * Le résultat est stable sur une saison, donc mis en cache par Next.js.
 */

import { NextResponse } from "next/server";
import { getChampionshipRoster } from "@/lib/mpgstats-client";
import { getSupportedChampionships } from "@/lib/championships";

// Cache côté serveur : le vivier ne change qu'aux mouvements de mercato.
export const revalidate = 21600; // 6 h

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ championshipId: string }> }
) {
  const { championshipId } = await params;

  if (!getSupportedChampionships().some((c) => c.id === championshipId)) {
    return NextResponse.json(
      { error: "Championnat non supporté" },
      { status: 400 }
    );
  }

  try {
    const players = await getChampionshipRoster(championshipId);
    if (players.length === 0) {
      return NextResponse.json(
        { error: "Vivier indisponible pour ce championnat", players: [] },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { championshipId, count: players.length, players },
      { headers: { "Cache-Control": "public, max-age=21600, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de la récupération du vivier", players: [] },
      { status: 500 }
    );
  }
}
