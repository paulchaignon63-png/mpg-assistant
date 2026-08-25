/** Diagnostic temporaire : structure ESPN core API (passes déc). À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const BASE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fra.1";

async function j(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.ok ? res.json() : null;
}

export async function GET() {
  const out: Record<string, unknown> = {};

  // 1) Leaders de la saison 2025 : catégories dispo + volume
  const leaders = (await j(`${BASE}/seasons/2025/types/1/leaders?lang=fr`)) as {
    categories?: Array<{ name?: string; displayName?: string; leaders?: Array<{ value?: number; athlete?: { $ref?: string } }> }>;
  } | null;
  if (leaders?.categories) {
    out.categories = leaders.categories.map((c) => ({
      name: c.name,
      displayName: c.displayName,
      nbLeaders: c.leaders?.length ?? 0,
    }));
    const assistCat = leaders.categories.find((c) => /assist/i.test(c.name ?? "") || /assist|passe/i.test(c.displayName ?? ""));
    if (assistCat?.leaders?.length) {
      // Résoudre les 3 premiers passeurs (nom via $ref athlete)
      const top = assistCat.leaders.slice(0, 3);
      const resolved = [];
      for (const l of top) {
        let nom = "?";
        if (l.athlete?.$ref) {
          const a = (await j(l.athlete.$ref)) as { displayName?: string; fullName?: string } | null;
          nom = a?.displayName ?? a?.fullName ?? "?";
        }
        resolved.push({ nom, passes_dec: l.value });
      }
      out.top_passeurs = resolved;
      out.nb_passeurs_total = assistCat.leaders.length;
    }
  } else {
    out.leaders_brut = leaders;
  }

  // 2) Endpoint alternatif : statistiques de saison par équipe (couverture complète ?)
  const teams = (await j(`${BASE}/seasons/2025/teams?lang=fr&limit=50`)) as { count?: number; items?: unknown[] } | null;
  out.nbEquipes = teams?.count ?? teams?.items?.length ?? null;

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
