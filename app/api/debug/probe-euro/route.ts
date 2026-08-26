import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(label: string, url: string) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    const text = await r.text();
    let shape = "";
    try {
      const j = JSON.parse(text);
      shape = JSON.stringify(j).slice(0, 700);
    } catch {
      shape = text.slice(0, 200);
    }
    return { label, url, status: r.status, len: text.length, shape };
  } catch (e) {
    return { label, url, status: "ERR", error: String(e).slice(0, 200) };
  }
}

export async function GET() {
  const out = await Promise.all([
    probe("core-ucl-seasons", "https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/seasons/2026/types/1/events?limit=5"),
    probe("core-ucl-calendar", "https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.champions/seasons/2026/types/1"),
    probe("site-ucl-scoreboard", "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20260916"),
    probe("site-fra1-teams", "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams"),
    probe("site-team-sched", "https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams/160/schedule"),
    probe("core-uel-events", "https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/seasons/2026/types/1/events?limit=5"),
  ]);
  return NextResponse.json({ probes: out });
}
