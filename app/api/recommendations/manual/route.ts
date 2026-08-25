/**
 * Calcul du meilleur 11 pour un effectif composé à la main.
 *
 * Aucune authentification MPG : les données (forme, blessures, prochain match)
 * viennent de MPGStats. Le moteur de scoring est le même que l'app a toujours
 * utilisé (lib/recommendation), alimenté par les joueurs sélectionnés.
 */

import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import {
  getRecommendedTeamWithSubstitutes,
  getSuggestedCaptain,
  type PoolPlayer,
} from "@/lib/recommendation";
import { getSupportedChampionships } from "@/lib/championships";

export async function POST(request: Request) {
  let body: { championshipId?: string; formation?: number; playerIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { championshipId, formation = 343, playerIds = [] } = body;

  if (!championshipId || !getSupportedChampionships().some((c) => c.id === championshipId)) {
    return NextResponse.json({ error: "Championnat non supporté" }, { status: 400 });
  }
  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return NextResponse.json({ error: "Effectif vide" }, { status: 400 });
  }

  try {
    const { players, nextMatchDate, playedRounds, totalTeams } = await getChampionshipData(championshipId);
    if (players.size === 0) {
      return NextResponse.json({ error: "Données du championnat indisponibles" }, { status: 502 });
    }

    // Construit les joueurs de l'effectif (avec statut) et un « squad » par id.
    const selected = playerIds
      .map((id) => players.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (selected.length === 0) {
      return NextResponse.json({ error: "Aucun joueur reconnu" }, { status: 400 });
    }

    const poolPlayers: PoolPlayer[] = selected.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      clubName: p.club,
      average: p.average,
      matchs: p.matchs,
      goals: p.goals,
      averageLast5: p.averageLast5,
      momentum: p.momentum,
      last5Notes: p.last5Notes,
      last5Minutes: p.last5Minutes,
      last5OpponentRounds: p.last5OpponentRounds,
      quotation: p.quotation,
      nextOpponentRank: p.nextOpponentRank,
      isHome: p.isHome,
      opponentGoalsFor: p.opponentGoalsFor,
      opponentGoalsAgainst: p.opponentGoalsAgainst,
      teamFormWinsLast5: p.teamFormWinsLast5,
      isInjured: p.status === "injured",
      isSuspended: p.status === "suspended",
      isDoubtful: p.status === "doubtful",
    }));

    const squad: Record<string, unknown> = {};
    for (const p of selected) squad[p.id] = { id: p.id };

    const { recommended, substitutes, lofteurs } = getRecommendedTeamWithSubstitutes(
      squad,
      formation,
      poolPlayers,
      {
        championshipDays: Math.max(1, playedRounds),
        totalTeams,
        nextMatchDate,
      }
    );

    const captain = getSuggestedCaptain(recommended);

    // Raison d'indisponibilité (blessé/suspendu) pour l'affichage.
    const statusById = new Map(selected.map((p) => [p.id, p]));
    const statusByName = new Map(selected.map((p) => [p.name, p]));
    const withReason = <T extends { id?: string; name?: string }>(p: T) => {
      const s =
        (p.id ? statusById.get(p.id) : undefined) ??
        (p.name ? statusByName.get(p.name) : undefined);
      return {
        ...p,
        statusReason: s?.statusReason,
        statusKind: s?.status,
        nextOpponentName: s?.nextOpponentName,
        isHome: s?.isHome,
      };
    };

    return NextResponse.json({
      formation,
      nextMatchDate: nextMatchDate?.toISOString() ?? null,
      recommended: recommended.map(withReason),
      substitutes: {
        G: (substitutes.G ?? []).map(withReason),
        D: (substitutes.D ?? []).map(withReason),
        M: (substitutes.M ?? []).map(withReason),
        A: (substitutes.A ?? []).map(withReason),
      },
      lofteurs: lofteurs.map(withReason),
      suggestedCaptainId: captain?.id ?? captain?.name ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Erreur lors du calcul" }, { status: 500 });
  }
}
