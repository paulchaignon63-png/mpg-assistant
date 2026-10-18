/**
 * Vivier des joueurs d'un championnat, pour composer un effectif à la main :
 * nom, club, poste (et poste détaillé), cote MPG, moyenne de la saison.
 * Source : MPGStats (un appel, mis en cache).
 */
import { NextResponse } from "next/server";
import { loadChampionship } from "@/lib/data/mpgstats";
import { getSupportedChampionships } from "@/lib/championships";

export const revalidate = 3600;

export async function GET(_request: Request, { params }: { params: Promise<{ championshipId: string }> }) {
  const { championshipId } = await params;
  if (!getSupportedChampionships().some((c) => c.id === championshipId)) {
    return NextResponse.json({ error: "Championnat non supporté" }, { status: 400 });
  }
  const snap = await loadChampionship(championshipId);
  if (!snap) {
    return NextResponse.json({ error: "Vivier indisponible pour ce championnat", players: [] }, { status: 502 });
  }
  const current = new Set(snap.currentClubIds);
  const players = snap.players
    .filter((p) => p.clubId != null && current.has(p.clubId))
    .map((p) => {
      const rated = p.matches.filter((m) => m.seasonId === snap.currentSeasonId && m.note > 0);
      return {
        id: p.id,
        name: p.name,
        club: p.club,
        position: p.position,
        detailedPosition: p.detailedPosition,
        quotation: p.quotation ?? null,
        average: rated.length ? Math.round((rated.reduce((a, m) => a + m.note, 0) / rated.length) * 100) / 100 : null,
        matches: rated.length,
      };
    })
    .sort((a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
  return NextResponse.json(
    { championshipId, count: players.length, players },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
