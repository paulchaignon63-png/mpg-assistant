/**
 * Matchs européens (Ligue des champions, Ligue Europa, Conference) autour de la
 * journée de championnat, via l'API publique ESPN (core).
 *
 * Pourquoi c'est utile : un club qui joue en Coupe d'Europe le mardi/mercredi
 * fait tourner le week-end, et l'entraîneur ménage ses cadres à l'approche d'une
 * échéance européenne. C'est la finesse qu'un habitué de MPG applique et qu'un
 * joueur occasionnel ignore — et la note seule ne la capture pas.
 *
 * Deux familles de compétitions côté ESPN :
 *  - les tours préliminaires / barrages, publiés dès l'été (`*_qual`) ;
 *  - la phase principale, publiée seulement après le tirage.
 * On interroge les deux : tant qu'une compétition n'a rien, elle renvoie une
 * liste vide, et le module s'active tout seul dès que le calendrier paraît.
 *
 * Le module est volontairement « best effort » : la moindre erreur réseau
 * renvoie une map vide plutôt que de faire échouer le calcul de la compo.
 */

const ESPN_BASE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/**
 * Slugs ESPN des compétitions européennes de clubs.
 * Les slugs invalides répondent 400 et sont simplement ignorés : la liste peut
 * donc contenir des candidats sans risque.
 */
const EURO_LEAGUES: Array<{ slug: string; label: string }> = [
  { slug: "uefa.champions", label: "Ligue des champions" },
  { slug: "uefa.champions_qual", label: "Ligue des champions" },
  { slug: "uefa.europa", label: "Ligue Europa" },
  { slug: "uefa.europa_qual", label: "Ligue Europa" },
  { slug: "uefa.europa.conf", label: "Conference League" },
  { slug: "uefa.europa.conf_qual", label: "Conference League" },
];

/** Fenêtre autour du coup d'envoi de la journée (en jours). */
const DAYS_BEFORE = 4;
const DAYS_AFTER = 3;

/** Plafond de matchs détaillés récupérés, pour borner le coût d'une requête. */
const MAX_EVENTS = 80;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface EuroFixture {
  /** Date du match européen. */
  date: Date;
  /** true = avant la journée de championnat, false = après. */
  before: boolean;
  /** « Ligue des champions », etc. */
  competition: string;
}

/**
 * Mots trop courants pour identifier un club : ils sont ignorés lors de la
 * comparaison (« Olympique Lyonnais » et « Lyon » doivent se rapprocher).
 */
const CLUB_NOISE = new Set([
  "fc", "ac", "as", "sc", "sv", "cf", "cd", "rc", "ss", "ssc", "afc", "bsc",
  "club", "clube", "de", "del", "di", "du", "des", "la", "le", "les", "los",
  "calcio", "futbol", "football", "association", "sportiv", "sportive",
  "1", "04", "05", "07", "08", "09", "1899", "1900",
]);

/**
 * Mots qui, eux, DISTINGUENT deux clubs d'une même ville : « Real » Madrid vs
 * « Atlético » Madrid, Manchester « United » vs « City ». Ils ne suffisent pas
 * à identifier un club, mais si les deux noms en portent et qu'ils diffèrent,
 * il s'agit forcément de clubs différents.
 */
const CLUB_QUALIFIERS = new Set([
  "real", "atletico", "athletic", "united", "city", "sporting", "olympique",
  "stade", "racing", "inter", "milan", "roma", "lazio", "borussia", "bayer",
  "bayern", "union", "west", "east", "nord", "sud",
]);

/**
 * Clubs que les deux sources nomment de façon irréconciliable par jetons, et
 * dont un rapprochement naïf produirait un faux positif grave.
 * « Paris » (PSG côté MPGStats) et « Paris FC » sont deux clubs de Ligue 1.
 */
const CLUB_ALIASES: Record<string, string> = {
  "paris": "psg",
  "paris saint germain": "psg",
  "paris sg": "psg",
  "psg": "psg",
  "paris fc": "paris-fc",
};

function normalizeClub(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Identité canonique d'un club ambigu, sinon null. */
function canonicalClub(name: string): string | null {
  return CLUB_ALIASES[normalizeClub(name)] ?? null;
}

/** Jetons distinctifs d'un nom de club (« olympique lyonnais » → ["lyonnais"]). */
function clubTokens(name: string): string[] {
  return normalizeClub(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !CLUB_NOISE.has(t) && !CLUB_QUALIFIERS.has(t));
}

function clubQualifiers(name: string): Set<string> {
  return new Set(normalizeClub(name).split(" ").filter((t) => CLUB_QUALIFIERS.has(t)));
}

/**
 * Deux noms désignent-ils le même club ?
 *
 * 1. Si l'un des deux est un cas ambigu répertorié, l'identité canonique
 *    tranche seule (évite « Paris FC » ↔ « Paris Saint-Germain »).
 * 2. Sinon on exige un jeton distinctif commun (ou un préfixe d'au moins
 *    4 caractères : « lyon » / « lyonnais »)…
 * 3. …et l'absence de qualificatifs contradictoires, sans quoi « Real Madrid »
 *    et « Atlético Madrid » se confondraient.
 */
export function clubsMatch(a: string, b: string): boolean {
  const ca = canonicalClub(a);
  const cb = canonicalClub(b);
  if (ca || cb) return ca != null && cb != null && ca === cb;

  const qa = clubQualifiers(a);
  const qb = clubQualifiers(b);
  if (qa.size > 0 && qb.size > 0) {
    const shared = [...qa].some((q) => qb.has(q));
    if (!shared) return false;
  }

  const ta = clubTokens(a);
  const tb = clubTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) return true;
      if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
    }
  }
  return false;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

interface EspnRefList {
  items?: Array<{ $ref?: string }>;
}

interface EspnEvent {
  date?: string;
  /** Format « Away at Home ». */
  name?: string;
  shortName?: string;
}

/**
 * Sépare le nom d'un événement ESPN en deux clubs.
 * ESPN écrit « Arsenal at Paris Saint-Germain » (visiteur « at » recevant),
 * parfois « X vs Y ».
 */
function splitEventName(name: string): [string, string] | null {
  const at = name.split(/\s+ at \s+|\s+ at\s+|\s+at\s+/);
  if (at.length === 2) return [at[0].trim(), at[1].trim()];
  const vs = name.split(/\s+vs\.?\s+/i);
  if (vs.length === 2) return [vs[0].trim(), vs[1].trim()];
  return null;
}

const cache = new Map<string, { at: number; value: Map<string, EuroFixture> }>();

/**
 * Renvoie, par nom de club (tel qu'écrit par ESPN), le match européen disputé
 * dans la fenêtre autour de `nextMatchDate`. Vide si rien ou en cas d'erreur.
 */
export async function getEuroFixtures(
  nextMatchDate: Date | undefined
): Promise<Map<string, EuroFixture>> {
  const empty = new Map<string, EuroFixture>();
  if (!nextMatchDate || Number.isNaN(nextMatchDate.getTime())) return empty;

  const kickoff = nextMatchDate.getTime();
  const from = new Date(kickoff - DAYS_BEFORE * 86400000);
  const to = new Date(kickoff + DAYS_AFTER * 86400000);
  const cacheKey = `${yyyymmdd(from)}-${yyyymmdd(to)}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;

  // 1) Références d'événements, compétition par compétition.
  const refLists = await Promise.all(
    EURO_LEAGUES.map(async (lg) => {
      const list = await fetchJson<EspnRefList>(
        `${ESPN_BASE}/${lg.slug}/events?dates=${range}&limit=100`
      );
      return { label: lg.label, refs: (list?.items ?? []).map((i) => i.$ref).filter(Boolean) as string[] };
    })
  );

  const flat: Array<{ label: string; ref: string }> = [];
  for (const { label, refs } of refLists) {
    for (const ref of refs) flat.push({ label, ref });
  }
  if (flat.length === 0) {
    cache.set(cacheKey, { at: Date.now(), value: empty });
    return empty;
  }

  // 2) Détail de chaque match : la date et les deux clubs tiennent dans `name`,
  //    ce qui évite une requête supplémentaire par équipe.
  const details = await Promise.all(
    flat.slice(0, MAX_EVENTS).map(async ({ label, ref }) => {
      const ev = await fetchJson<EspnEvent>(ref.replace(/^http:/, "https:"));
      return ev ? { label, ev } : null;
    })
  );

  const out = new Map<string, EuroFixture>();
  for (const d of details) {
    if (!d?.ev?.date || !d.ev.name) continue;
    const date = new Date(d.ev.date);
    if (Number.isNaN(date.getTime())) continue;
    const pair = splitEventName(d.ev.name);
    if (!pair) continue;
    const fixture: EuroFixture = {
      date,
      before: date.getTime() < kickoff,
      competition: d.label,
    };
    for (const club of pair) {
      // Un club peut jouer deux fois dans la fenêtre (aller/retour) : on garde
      // le match le plus proche du coup d'envoi, c'est lui qui pèse.
      const prev = out.get(club);
      if (
        !prev ||
        Math.abs(date.getTime() - kickoff) < Math.abs(prev.date.getTime() - kickoff)
      ) {
        out.set(club, fixture);
      }
    }
  }

  cache.set(cacheKey, { at: Date.now(), value: out });
  return out;
}

/** Retrouve le match européen d'un club nommé selon MPGStats. */
export function findEuroFixture(
  fixtures: Map<string, EuroFixture>,
  clubName: string | undefined
): EuroFixture | undefined {
  if (!clubName || fixtures.size === 0) return undefined;
  for (const [espnName, fixture] of fixtures) {
    if (clubsMatch(espnName, clubName)) return fixture;
  }
  return undefined;
}
