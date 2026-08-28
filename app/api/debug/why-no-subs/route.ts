import { NextResponse } from "next/server";
import { getChampionshipData } from "@/lib/mpgstats-client";
import { getEuroFixtures, findEuroFixture } from "@/lib/euro-fixtures";
import {
  getRecommendedTeamWithSubstitutes,
  MIN_SUBSTITUTE_SCORE,
  type PoolPlayer,
} from "@/lib/recommendation";
import { buildTacticalSubs, type SubCandidate } from "@/lib/tactical-subs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAMES = [
  "Samba", "Hakimi", "Adjei", "Otavio", "Ngoy",
  "Rongier", "Vitinha", "Lees-Melou", "Tosin", "Namaso", "Sima",
  "Jorgensen", "Nicolaisen", "Locko", "Thauvin", "Andre", "Ouazzani",
];

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z]/g, "");
}

export async function GET() {
  const { players, nextMatchDate, playedRounds, totalTeams } = await getChampionshipData("1");

  const wanted = NAMES.map(norm);
  const picked = new Map<string, NonNullable<ReturnType<typeof players.get>>>();
  for (const p of players.values()) {
    const last = norm(p.name.split(/\s+/).slice(-1)[0]);
    const full = norm(p.name);
    for (const w of wanted) {
      if (last === w || full.endsWith(w)) {
        const prev = picked.get(w);
        // en cas d'homonyme, garder le plus titulaire
        if (!prev || (p.pctTitularisations ?? 0) > (prev.pctTitularisations ?? 0)) picked.set(w, p);
      }
    }
  }

  const selected = [...picked.values()];
  const poolPlayers: PoolPlayer[] = selected.map((p) => ({
    id: p.id, name: p.name, position: p.position, clubName: p.club,
    average: p.average, matchs: p.matchs, goals: p.goals,
    averageLast5: p.averageLast5, momentum: p.momentum,
    last5Notes: p.last5Notes, last5Minutes: p.last5Minutes,
    last5OpponentRounds: p.last5OpponentRounds, quotation: p.quotation,
    pctTitularisations: p.pctTitularisations, accuratePassPct: p.accuratePassPct,
    nextOpponentRank: p.nextOpponentRank, isHome: p.isHome,
    teamFormWinsLast5: p.teamFormWinsLast5, teamRank: p.teamRank,
    isInjured: p.status === "injured", isSuspended: p.status === "suspended",
    isDoubtful: p.status === "doubtful",
  }));
  const squad: Record<string, unknown> = {};
  for (const p of selected) squad[p.id] = { id: p.id };

  const { recommended, substitutes } = getRecommendedTeamWithSubstitutes(
    squad, 433, poolPlayers,
    { championshipDays: Math.max(1, playedRounds), totalTeams, nextMatchDate }
  );

  const euro = await getEuroFixtures(nextMatchDate);
  const byId = new Map(selected.map((p) => [p.id, p]));

  const bench = (["G", "D", "M", "A"] as const).flatMap((pos) => substitutes[pos] ?? []);
  const benchByPos: Record<string, Array<{ name: string; score: number }>> = { G: [], D: [], M: [], A: [] };
  for (const b of bench) {
    if (b.position) benchByPos[b.position].push({ name: b.name ?? "?", score: b.recommendationScore });
  }
  for (const k of Object.keys(benchByPos)) benchByPos[k].sort((a, b) => b.score - a.score);

  const diagnostic = recommended.map((r) => {
    const s = byId.get(r.id ?? "");
    const opts = benchByPos[r.position] ?? [];
    const best = opts[0];
    const mins = (s?.last5Minutes ?? []).filter((m) => m > 0);
    const avgMin = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const f = findEuroFixture(euro, s?.club);
    return {
      titulaire: r.name, poste: r.position, note: r.recommendationScore, club: s?.club,
      meilleurRemplacant: best ? `${best.name} (${best.score})` : "AUCUN à ce poste",
      ecart: best ? Math.round((best.score - r.recommendationScore) * 100) / 100 : null,
      blocage: !best
        ? "aucun remplaçant à ce poste"
        : best.score < MIN_SUBSTITUTE_SCORE
          ? `banc trop faible (${best.score} < ${MIN_SUBSTITUTE_SCORE})`
          : null,
      pctTitularisation: s?.pctTitularisations,
      minutesMoyennes: avgMin,
      rangAdversaire: s?.nextOpponentRank,
      domicile: s?.isHome,
      coupeEurope: f ? `${f.competition} ${f.before ? "avant" : "après"}` : null,
      incertain: s?.status === "doubtful",
    };
  });

  const toCand = (p: { id?: string; name?: string; position?: "G"|"D"|"M"|"A"; clubName?: string; recommendationScore: number }): SubCandidate => {
    const st = p.id ? byId.get(p.id) : undefined;
    const f2 = findEuroFixture(euro, st?.club);
    return {
      id: p.id, name: p.name,
      position: (p.position ?? st?.position ?? "M") as "G"|"D"|"M"|"A",
      clubName: st?.club, score: p.recommendationScore,
      isDoubtful: st?.status === "doubtful",
      pctTitularisations: st?.pctTitularisations,
      nextOpponentRank: st?.nextOpponentRank, isHome: st?.isHome,
      averageLast5: st?.averageLast5, momentum: st?.momentum,
      last5Minutes: st?.last5Minutes,
      midweekBefore: f2?.before === true || undefined,
      midweekAfter: (f2 != null && !f2.before) || undefined,
      midweekCompetition: f2?.competition,
    };
  };
  const subs = buildTacticalSubs(recommended.map(toCand), bench.map(toCand), totalTeams);

  return NextResponse.json({
    suggestions: subs.map((x) => `[${x.kind}] ${x.out.name} (${x.out.score}) -> ${x.in.name} (${x.in.score}) : ${x.reason}`),
    journee: nextMatchDate?.toISOString(),
    joueursReconnus: selected.length,
    manquants: NAMES.filter((n) => !picked.has(norm(n))),
    seuils: { MIN_SUBSTITUTE_SCORE, ALT_MIN_DELTA: 0.6, MATCH_PIEGE_MARGIN: 0.8, ROTATION: 0.55, EARLY_SUB: 66, FULL_GAME: 80 },
    banc: benchByPos,
    diagnostic,
  });
}
