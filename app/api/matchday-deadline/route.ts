import { NextRequest, NextResponse } from "next/server";
import { getMatchdayDeadlineWithBreakStatus } from "@/lib/matchday-deadline-service";

/**
 * GET /api/matchday-deadline?championshipId=1&mpgNextRealGameWeekDate=...
 * Retourne la deadline de composition (1er match - 5 min) ou le statut de pause.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const championshipId = searchParams.get("championshipId") ?? "1";
  const mpgNextRealGameWeekDate = searchParams.get("mpgNextRealGameWeekDate") ?? undefined;

  try {
    const { result, breakStatus } = await getMatchdayDeadlineWithBreakStatus(
      championshipId,
      mpgNextRealGameWeekDate
    );

    if (result) {
      return NextResponse.json({
        deadline: result.deadline.toISOString(),
        firstMatchDate: result.firstMatchDate.toISOString(),
        gameWeek: result.gameWeek ?? null,
        source: result.source,
        breakStatus: null,
      });
    }

    return NextResponse.json({
      deadline: null,
      firstMatchDate: null,
      gameWeek: null,
      source: null,
      breakStatus: breakStatus
        ? {
            type: breakStatus.type,
            message: breakStatus.message,
            resumeDate: breakStatus.resumeDate?.toISOString() ?? null,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
