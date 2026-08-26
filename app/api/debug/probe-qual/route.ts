import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const C = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

async function probe(label: string, url: string) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    const t = await r.text();
    return { label, url: url.replace(C, ""), status: r.status, body: t.slice(0, 400) };
  } catch (e) {
    return { label, url, status: "ERR", body: String(e).slice(0, 150) };
  }
}

export async function GET() {
  const slugs = [
    "uefa.champions_qual",
    "uefa.europa_qual",
    "uefa.europa_conf_qual",
    "uefa.champions",
    "uefa.europa",
    "uefa.europa_conf",
  ];
  const jobs = [
    ...slugs.map((s) =>
      probe(`${s}:dates`, `${C}/${s}/events?dates=20260818-20260903&limit=6`)
    ),
    probe("ucl:types2026", `${C}/uefa.champions/seasons/2026/types?limit=12`),
    probe("uclqual:seasons", `${C}/uefa.champions_qual/seasons?limit=3`),
  ];
  return NextResponse.json({ probes: await Promise.all(jobs) });
}
