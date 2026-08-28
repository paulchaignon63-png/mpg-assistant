import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import { getEuroFixtures, findEuroFixture } from "@/lib/euro-fixtures";
import { getRecommendedTeamWithSubstitutes, type PoolPlayer } from "@/lib/recommendation";
import { buildTacticalSubs, type SubCandidate } from "@/lib/tactical-subs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAMES = ["Samba","Hakimi","Adjei","Otavio","Ngoy","Rongier","Vitinha","Lees-Melou",
  "Tosin","Namaso","Sima","Jorgensen","Nicolaisen","Locko","Thauvin","Andre","Ouazzani"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^a-z]/g,"");

export async function GET() {
  const { players, nextMatchDate, playedRounds, totalTeams } = await getChampionshipData("1");
  const wanted = NAMES.map(norm);
  const picked = new Map<string, NonNullable<ReturnType<typeof players.get>>>();
  for (const p of players.values()) {
    const last = norm(p.name.split(/\s+/).slice(-1)[0]);
    for (const w of wanted) {
      if (last === w || norm(p.name).endsWith(w)) {
        const prev = picked.get(w);
        if (!prev || (p.pctTitularisations ?? 0) > (prev.pctTitularisations ?? 0)) picked.set(w, p);
      }
    }
  }
  const selected = [...picked.values()];
  const poolPlayers: PoolPlayer[] = selected.map((p) => ({
    id: p.id, name: p.name, position: p.position, clubName: p.club,
    average: p.average, matchs: p.matchs, goals: p.goals, averageLast5: p.averageLast5,
    momentum: p.momentum, last5Notes: p.last5Notes, last5Minutes: p.last5Minutes,
    last5OpponentRounds: p.last5OpponentRounds, quotation: p.quotation,
    pctTitularisations: p.pctTitularisations, accuratePassPct: p.accuratePassPct,
    nextOpponentRank: p.nextOpponentRank, isHome: p.isHome,
    teamFormWinsLast5: p.teamFormWinsLast5, teamRank: p.teamRank,
    isInjured: p.status === "injured", isSuspended: p.status === "suspended",
    isDoubtful: p.status === "doubtful",
  }));
  const squad: Record<string, unknown> = {};
  for (const p of selected) squad[p.id] = { id: p.id };
  const { recommended, substitutes } = getRecommendedTeamWithSubstitutes(squad, 433, poolPlayers,
    { championshipDays: Math.max(1, playedRounds), totalTeams, nextMatchDate });

  const euro = await getEuroFixtures(nextMatchDate);
  const byId = new Map(selected.map((p) => [p.id, p]));
  const bench = (["G","D","M","A"] as const).flatMap((pos) => substitutes[pos] ?? []);
  const toCand = (p: { id?: string; name?: string; position?: "G"|"D"|"M"|"A"; clubName?: string; recommendationScore: number }): SubCandidate => {
    const st = p.id ? byId.get(p.id) : undefined;
    const f = findEuroFixture(euro, st?.club);
    return { id: p.id, name: p.name, position: (p.position ?? "M") as "G"|"D"|"M"|"A",
      clubName: st?.club, score: p.recommendationScore, isDoubtful: st?.status === "doubtful",
      pctTitularisations: st?.pctTitularisations, nextOpponentRank: st?.nextOpponentRank,
      isHome: st?.isHome, averageLast5: st?.averageLast5, momentum: st?.momentum,
      last5Minutes: st?.last5Minutes, midweekBefore: f?.before === true || undefined,
      midweekAfter: (f != null && !f.before) || undefined, midweekCompetition: f?.competition };
  };
  const subs = buildTacticalSubs(recommended.map(toCand), bench.map(toCand), totalTeams);
  return NextResponse.json({
    onze: recommended.map((r) => `${r.position} ${r.name} ${r.recommendationScore} (cote ${byId.get(r.id ?? "")?.quotation})`),
    banc: bench.map((b) => `${b.position} ${b.name} ${b.recommendationScore} (cote ${byId.get(b.id ?? "")?.quotation})`),
    suggestions: subs.map((x) => `[${x.kind}] ${x.out.name} (${x.out.score}) -> ${x.in.name} (${x.in.score}) : ${x.reason}`),
  });
}
