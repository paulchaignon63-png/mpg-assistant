/**
 * Script d'inspection Sofascore API
 * Appelle les endpoints pour découvrir la structure des réponses (lineups, standings, events).
 * Usage: npx tsx scripts/inspect-sofascore.ts
 */

const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const CHAMP_TO_SOFASCORE: Record<string, number> = {
  "1": 34,
  LIGUE_1: 34,
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    console.error("fetch error:", e);
    return null;
  }
}

async function main() {
  const tid = CHAMP_TO_SOFASCORE["1"] ?? 34;
  const seasonData = await fetchJson<{ seasons?: Array<{ id: number; year: string }> }>(
    `${SOFASCORE_BASE}/unique-tournament/${tid}/seasons`
  );
  const seasonId = seasonData?.seasons?.[0]?.id ?? seasonData?.seasons?.[1]?.id;
  if (!seasonId) {
    console.error("No season found");
    return;
  }
  console.log("Season ID:", seasonId);

  // 1. Fetch a completed match (round 1-15, status 100)
  let eventId: number | null = null;
  for (let round = 1; round <= 15; round++) {
    const eventsData = await fetchJson<{ events?: Array<{ id: number; status?: { code?: number } }> }>(
      `${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/events/round/${round}`
    );
    const finished = (eventsData?.events ?? []).find((e) => e.status?.code === 100);
    if (finished) {
      eventId = finished.id;
      console.log("\n--- EVENT TERMINÉ (round", round, ") ---");
      console.log("Event ID:", eventId);
      break;
    }
  }

  // 2. Inspect lineups for this event
  if (eventId) {
    const lineupsData = await fetchJson<Record<string, unknown>>(
      `${SOFASCORE_BASE}/event/${eventId}/lineups`
    );
    console.log("\n--- LINEUPS FULL RESPONSE (keys) ---");
    console.log(Object.keys(lineupsData ?? {}));
    const home = (lineupsData as { home?: { players?: unknown[] } })?.home?.players?.[0];
    if (home) {
      console.log("\n--- FIRST PLAYER statistics ---");
      console.log(JSON.stringify((home as { statistics?: unknown }).statistics, null, 2));
    }
  }

  // 3. Inspect standings structure
  const standingsData = await fetchJson<Record<string, unknown>>(
    `${SOFASCORE_BASE}/unique-tournament/${tid}/season/${seasonId}/standings/total`
  );
  console.log("\n--- STANDINGS FULL STRUCTURE (first row) ---");
  const rows = (standingsData as { standings?: Array<{ rows?: unknown[] }> })?.standings?.[0]?.rows;
  if (rows?.[0]) {
    console.log(JSON.stringify(rows[0], null, 2));
  }

  // 4. Inspect event structure (for homeScore, awayScore)
  if (eventId) {
    const eventData = await fetchJson<Record<string, unknown>>(
      `${SOFASCORE_BASE}/event/${eventId}`
    );
    console.log("\n--- EVENT FULL (score fields) ---");
    console.log(JSON.stringify(eventData, null, 2));
  }

  console.log("\n--- DONE ---");
}

main().catch(console.error);
