import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import { getSeasonAssists, normalizeAssistKey } from "@/lib/espn-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAMES = ["Thauvin", "Vitinha", "Rongier", "Lees-Melou", "Andre"];

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z]/g, "");
}

export async function GET() {
  const { players, playedRounds, totalTeams, nextMatchDate } = await getChampionshipData("1");
  const assists = await getSeasonAssists("1", new Date().getUTCFullYear()).catch(
    () => new Map<string, number>()
  );

  const out = [];
  for (const p of players.values()) {
    const last = norm(p.name.split(/\s+/).slice(-1)[0]);
    if (!NAMES.map(norm).includes(last)) continue;
    if ((p.matchs ?? 0) === 0 && (p.quotation ?? 0) < 10) continue;
    out.push({
      nom: p.name,
      club: p.club,
      poste: p.position,
      cote: p.quotation,
      moyenne: p.average,
      matchs: p.matchs,
      buts: p.goals,
      passes: assists.get(normalizeAssistKey(p.name)) ?? 0,
      moyenne5: p.averageLast5,
      notes5: p.last5Notes,
      minutes5: p.last5Minutes,
      momentum: p.momentum,
      pctTitu: p.pctTitularisations,
      passesReussiesPct: p.accuratePassPct,
      rangEquipe: p.teamRank,
      rangAdversaire: p.nextOpponentRank,
      adversaire: p.nextOpponentName,
      domicile: p.isHome,
      formeEquipe: p.teamFormWinsLast5,
      statut: p.status,
    });
  }
  return NextResponse.json({ journeesJouees: playedRounds, totalEquipes: totalTeams, prochainMatch: nextMatchDate, joueurs: out });
}
