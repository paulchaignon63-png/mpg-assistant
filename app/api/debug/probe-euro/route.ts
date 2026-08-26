import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(label: string, url: string, slice = 600) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    const text = await r.text();
    return { label, status: r.status, len: text.length, shape: text.slice(0, slice) };
  } catch (e) {
    return { label, status: "ERR", error: String(e).slice(0, 150) };
  }
}

export async function GET() {
  const C = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";
  const out = await Promise.all([
    probe("ucl-seasons-list", `${C}/uefa.champions/seasons?limit=4`),
    probe("ucl-2027-t1", `${C}/uefa.champions/seasons/2027/types/1/events?limit=3`),
    probe("ucl-2026-root", `${C}/uefa.champions/seasons/2026`, 900),
    probe("ucl-allevents", `${C}/uefa.champions/events?limit=3`),
    probe("ucl-2026-t2", `${C}/uefa.champions/seasons/2026/types/2/events?limit=3`),
    probe("fra1-2026-events", `${C}/fra.1/seasons/2026/types/1/events?limit=3`),
  ]);
  return NextResponse.json({ probes: out });
}
