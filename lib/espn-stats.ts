/**
 * Passes décisives par saison via l'API publique ESPN (core).
 *
 * MPGStats ne fournit les passes décisives qu'en cumul carrière ; les autres
 * sources structurées (Sofascore, FBref, Understat, worldfootball) bloquent les
 * IP de datacenter. L'API core d'ESPN, elle, répond depuis Vercel et expose les
 * meneurs de la saison (top 25) par catégorie, avec la valeur et le nom.
 *
 * On récupère donc les passes décisives des ~25 meilleurs passeurs — c'est-à-dire
 * exactement les joueurs pour qui la stat compte ; les autres en ont 0-2, sans
 * effet. En début de saison, la saison passée sert de référence.
 */

const ESPN_BASE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

/** championshipId interne → slug de ligue ESPN. */
const CHAMP_TO_ESPN: Record<string, string> = {
  "1": "fra.1",
  "2": "eng.1",
  "3": "esp.1",
  "4": "fra.2",
  "5": "ita.1",
  "7": "tur.1",
};

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface EspnLeaders {
  categories?: Array<{
    name?: string;
    leaders?: Array<{ value?: number; athlete?: { $ref?: string } }>;
  }>;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Récupère les passes décisives (top passeurs) d'une saison ESPN donnée. */
async function fetchAssistsForSeason(
  slug: string,
  year: number
): Promise<Map<string, number>> {
  const leaders = await fetchJson<EspnLeaders>(
    `${ESPN_BASE}/${slug}/seasons/${year}/types/1/leaders?lang=fr`
  );
  const cat = leaders?.categories?.find((c) => c.name === "assists");
  const entries = cat?.leaders ?? [];
  if (entries.length === 0) return new Map();

  // Résolution des noms (un $ref athlète par entrée), en parallèle et borné.
  const resolved = await Promise.all(
    entries.slice(0, 30).map(async (l) => {
      if (l.value == null || !l.athlete?.$ref) return null;
      const a = await fetchJson<{ displayName?: string; fullName?: string }>(l.athlete.$ref);
      const name = a?.displayName ?? a?.fullName;
      return name ? { key: normalizeKey(name), value: l.value } : null;
    })
  );

  const map = new Map<string, number>();
  for (const r of resolved) if (r) map.set(r.key, r.value);
  return map;
}

// Cache mémoire (durée de vie du lambda) : la donnée saison est stable.
const cache = new Map<string, { at: number; data: Map<string, number> }>();
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Passes décisives par joueur (clé = nom normalisé) pour un championnat.
 * Utilise la saison en cours si elle a de la matière, sinon la saison passée.
 */
export async function getSeasonAssists(
  championshipId: number | string,
  currentYear: number
): Promise<Map<string, number>> {
  const slug = CHAMP_TO_ESPN[String(championshipId)];
  if (!slug) return new Map();

  const cacheKey = `${slug}_${currentYear}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  // Saison en cours d'abord ; si elle est trop maigre (max < 4 passes déc.),
  // on prend la saison passée comme référence.
  let data = await fetchAssistsForSeason(slug, currentYear);
  const maxCur = data.size ? Math.max(...data.values()) : 0;
  if (maxCur < 4) {
    const prev = await fetchAssistsForSeason(slug, currentYear - 1);
    if (prev.size) data = prev;
  }

  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export { normalizeKey as normalizeAssistKey };
