import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const C = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

async function probe(label: string, url: string, n = 300) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    const t = await r.text();
    return { label, status: r.status, body: t.slice(0, n) };
  } catch (e) {
    return { label, status: "ERR", body: String(e).slice(0, 120) };
  }
}

export async function GET() {
  const cands = [
    "uefa.conference",
    "uefa.conf",
    "uefa.conference_qual",
    "uefa.conf_qual",
    "uefa.europa.conf",
    "uefa.europa.conf_qual",
  ];
  const jobs: Array<Promise<unknown>> = cands.map((s) =>
    probe(`slug:${s}`, `${C}/${s}/events?dates=20260818-20260903&limit=2`, 180)
  );

  // Un vrai match de barrage C1 : nom des équipes + date, sans requête supplémentaire ?
  jobs.push(
    (async () => {
      const r = await fetch(
        `${C}/uefa.champions_qual/events/401909158?lang=fr`,
        { headers: { "User-Agent": UA }, cache: "no-store" }
      );
      const j = await r.json();
      return {
        label: "event-detail",
        status: r.status,
        date: j?.date,
        name: j?.name,
        shortName: j?.shortName,
        competitors: (j?.competitions?.[0]?.competitors ?? []).map(
          (c: { homeAway?: string; team?: { $ref?: string } }) => c.homeAway
        ),
      };
    })().catch((e) => ({ label: "event-detail", error: String(e).slice(0, 150) }))
  );

  // Liste des matchs C1 barrage avec noms, via le paramètre dates
  return NextResponse.json({ probes: await Promise.all(jobs) });
}
