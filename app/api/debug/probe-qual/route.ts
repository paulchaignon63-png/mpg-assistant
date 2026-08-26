import { NextResponse } from "next/server";
import { getEuroFixtures, findEuroFixture } from "@/lib/euro-fixtures";
import { getChampionshipData } from "@/lib/mpgstats-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { nextMatchDate, players } = await getChampionshipData("1");

  const fixtures = await getEuroFixtures(nextMatchDate);

  // Clubs de Ligue 1 présents dans l'effectif du championnat
  const l1Clubs = [...new Set([...players.values()].map((p) => p.club).filter(Boolean))].sort();

  const matched = l1Clubs
    .map((club) => {
      const f = findEuroFixture(fixtures, club);
      return f
        ? {
            club,
            competition: f.competition,
            date: f.date.toISOString().slice(0, 16),
            avantLaJournee: f.before,
          }
        : null;
    })
    .filter(Boolean);

  return NextResponse.json({
    journee: nextMatchDate?.toISOString() ?? null,
    matchsEuropeensTrouves: fixtures.size,
    exemplesEspn: [...fixtures.entries()].slice(0, 12).map(([club, f]) => ({
      club,
      comp: f.competition,
      date: f.date.toISOString().slice(0, 16),
    })),
    clubsL1: l1Clubs.length,
    clubsL1Concernes: matched,
  });
}
