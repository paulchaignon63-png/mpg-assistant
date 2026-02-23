/**
 * API route - récupérer les données scrappées
 * GET /api/scraped?championship=1 - agrège L'Equipe, Transfermarkt, Eurosport, flux RSS
 * championship: 1=L1, 2=PL, 3=Liga, 4=L2, 5=Serie A
 */

import { NextRequest, NextResponse } from "next/server";
import { aggregateScrapedData } from "@/lib/scrapers";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const championshipId = searchParams.get("championship") ?? undefined;
    const data = await aggregateScrapedData({
      transfermarkt: true,
      lequipe: true,
      eurosport: true,
      rss: true,
      maxNewsPerSource: 20,
      championshipId: championshipId ? Number(championshipId) || championshipId : undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraping failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
