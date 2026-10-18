/**
 * POST /api/mpg/submit — envoie la compo sur MPG (remplace celle de la journée).
 * Corps : { divisionId, teamId, championshipId, plan: SubmitPlan }
 */
import { NextResponse } from "next/server";
import { MpgAuthError, readMpgSession, submitMpgLineup, type SubmitPlan } from "@/lib/mpg-link";

export async function POST(request: Request) {
  const session = await readMpgSession();
  if (!session) return NextResponse.json({ error: "Non connecté à MPG" }, { status: 401 });
  let body: { divisionId?: string; teamId?: string; championshipId?: string; plan?: SubmitPlan };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const { divisionId, teamId, championshipId, plan } = body;
  if (!divisionId || !teamId || !championshipId || !plan?.starters?.length) {
    return NextResponse.json({ error: "Compo incomplète" }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitMpgLineup(session.token, divisionId, teamId, championshipId, plan));
  } catch (e) {
    const status = e instanceof MpgAuthError ? 401 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Envoi impossible" }, { status });
  }
}
