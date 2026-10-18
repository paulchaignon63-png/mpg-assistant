/**
 * Identité des clubs entre sources (MPGStats, ESPN, Sofascore, cotes…).
 *
 * L'ancienne règle acceptait un rapprochement dès qu'un nom était contenu dans
 * l'autre. « paris » étant contenu dans « paris fc », la forme, le domicile ou
 * l'adversaire du PSG pouvaient être attribués au Paris FC (et inversement)
 * selon l'ordre d'itération. Même risque avec « Inter » / « Inter Miami »,
 * « Real » / « Real Sociedad », etc.
 *
 * Nouvelle règle, par ordre de confiance :
 *   1. alias connu → identifiant canonique (« PSG », « Paris SG » → psg) ;
 *   2. nom normalisé identique ;
 *   3. mêmes mots significatifs une fois retirés les mots génériques
 *      (« RC Lens » = « Lens », « Olympique de Marseille » = « Marseille ») ;
 *   4. (avec une liste de candidats) un seul candidat dont les mots sont
 *      inclus dans ceux du nom cherché — sinon, pas de correspondance.
 *
 * Un nom ambigu ne correspond à rien : mieux vaut perdre un signal que
 * l'attribuer au mauvais club.
 */

/** Minuscules, sans accents ni ponctuation, espaces normalisés. */
export function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Variantes de noms → identifiant canonique. Clés déjà normalisées.
 * On n'y met que les cas que la règle des mots significatifs ne règle pas :
 * sigles, surnoms, et homonymes à séparer explicitement.
 */
const ALIASES: Record<string, string> = {
  // Paris : deux clubs en Ligue 1, à ne jamais confondre.
  paris: "psg",
  psg: "psg",
  "paris sg": "psg",
  "paris saint germain": "psg",
  "paris saint germain fc": "psg",
  "paris fc": "paris-fc",
  pfc: "paris-fc",
  // Ligue 1 / Ligue 2
  om: "marseille",
  "olympique marseille": "marseille",
  "olympique de marseille": "marseille",
  ol: "lyon",
  "olympique lyonnais": "lyon",
  losc: "lille",
  "losc lille": "lille",
  "lille osc": "lille",
  ogcn: "nice",
  "ogc nice": "nice",
  "as monaco": "monaco",
  "stade rennais": "rennes",
  "stade rennais fc": "rennes",
  "stade brestois": "brest",
  "stade brestois 29": "brest",
  "rc strasbourg": "strasbourg",
  "rc strasbourg alsace": "strasbourg",
  "rc lens": "lens",
  "racing club de lens": "lens",
  "fc nantes": "nantes",
  "aj auxerre": "auxerre",
  "angers sco": "angers",
  sco: "angers",
  "toulouse fc": "toulouse",
  "le havre ac": "le-havre",
  hac: "le-havre",
  "le havre": "le-havre",
  "fc lorient": "lorient",
  "fc metz": "metz",
  "estac troyes": "troyes",
  estac: "troyes",
  "es troyes ac": "troyes",
  "le mans fc": "le-mans",
  "le mans": "le-mans",
  "as saint etienne": "saint-etienne",
  asse: "saint-etienne",
  "saint etienne": "saint-etienne",
  "st etienne": "saint-etienne",
  "stade de reims": "reims",
  "montpellier hsc": "montpellier",
  mhsc: "montpellier",
  // Premier League
  "man city": "manchester-city",
  "manchester city": "manchester-city",
  "man utd": "manchester-united",
  "man united": "manchester-united",
  "manchester united": "manchester-united",
  spurs: "tottenham",
  "tottenham hotspur": "tottenham",
  wolves: "wolverhampton",
  "wolverhampton wanderers": "wolverhampton",
  "nottm forest": "nottingham-forest",
  "nottingham forest": "nottingham-forest",
  "newcastle united": "newcastle",
  "west ham united": "west-ham",
  "west ham": "west-ham",
  "brighton and hove albion": "brighton",
  "afc bournemouth": "bournemouth",
  "leeds united": "leeds",
  "leicester city": "leicester",
  "ipswich town": "ipswich",
  "sheffield united": "sheffield-united",
  "sheffield utd": "sheffield-united",
  // Liga
  "real madrid": "real-madrid",
  "real madrid cf": "real-madrid",
  "atletico madrid": "atletico-madrid",
  "atletico de madrid": "atletico-madrid",
  "club atletico de madrid": "atletico-madrid",
  "atl madrid": "atletico-madrid",
  barca: "barcelona",
  "fc barcelona": "barcelona",
  "real sociedad": "real-sociedad",
  "real betis": "real-betis",
  betis: "real-betis",
  "athletic club": "athletic-bilbao",
  "athletic bilbao": "athletic-bilbao",
  "celta vigo": "celta",
  "rc celta": "celta",
  "rayo vallecano": "rayo",
  "deportivo alaves": "alaves",
  "real valladolid": "valladolid",
  "real oviedo": "oviedo",
  "real mallorca": "mallorca",
  "rcd mallorca": "mallorca",
  "rcd espanyol": "espanyol",
  // Serie A
  inter: "inter",
  "inter milan": "inter",
  internazionale: "inter",
  "fc internazionale": "inter",
  "fc internazionale milano": "inter",
  "ac milan": "milan",
  milan: "milan",
  juve: "juventus",
  "as roma": "roma",
  "ss lazio": "lazio",
  "ssc napoli": "napoli",
  "hellas verona": "verona",
};

/** Mots qui ne distinguent pas un club d'un autre. */
const GENERIC_TOKENS = new Set([
  "fc", "cf", "ac", "as", "sc", "rc", "afc", "ssc", "ss", "us", "ud", "cd", "sd", "rcd",
  "ogc", "aj", "sco", "osc", "hsc", "ca", "club", "de", "du", "des", "la", "le", "the",
  "olympique", "stade", "racing", "calcio", "football", "futbol", "sporting", "association",
  "and", "1899", "1907", "1909", "29",
]);

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t && !GENERIC_TOKENS.has(t));
}

/**
 * Clé canonique d'un nom de club : l'alias s'il est connu, sinon les mots
 * significatifs triés. Deux noms désignent le même club si leurs clés sont
 * égales.
 */
export function clubKey(name: string | undefined | null): string {
  if (!name) return "";
  const n = normalizeClubName(name);
  if (!n) return "";
  const alias = ALIASES[n];
  if (alias) return alias;
  const tokens = significantTokens(n);
  if (tokens.length === 0) return n;
  const joined = tokens.join(" ");
  // Le nom privé de ses mots génériques peut lui-même être un alias
  // (« Club Atlético de Madrid » → « atletico madrid »).
  return ALIASES[joined] ?? tokens.sort().join("-");
}

/** Deux libellés désignent-ils le même club ? Jamais par sous-chaîne. */
export function sameClub(a: string | undefined | null, b: string | undefined | null): boolean {
  const ka = clubKey(a);
  const kb = clubKey(b);
  return ka !== "" && ka === kb;
}

/**
 * Valeur d'une map indexée par nom de club, pour un libellé venu d'une autre
 * source. Remplace les boucles « k.includes(x) || x.includes(k) ».
 */
export function getByClub<V>(
  map: Map<string, V>,
  clubName: string | undefined | null
): V | undefined {
  if (!clubName || map.size === 0) return undefined;
  const direct = map.get(clubName);
  if (direct !== undefined) return direct;
  const key = createClubMatcher([...map.keys()])(clubName);
  return key !== undefined ? map.get(key) : undefined;
}

/**
 * Rapprocheur pour une liste fermée de clubs (ceux d'un championnat). En plus
 * de `sameClub`, accepte un nom plus long que le candidat (« Stade Brestois
 * 29 Bretagne » → « Brest ») tant qu'un SEUL candidat convient.
 */
export function createClubMatcher<T extends string>(candidates: readonly T[]) {
  const byKey = new Map<string, T[]>();
  for (const c of candidates) {
    const k = clubKey(c);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }
  const tokensOf = new Map<T, string[]>(
    candidates.map((c) => [c, significantTokens(normalizeClubName(c))])
  );

  return function match(name: string | undefined | null): T | undefined {
    const k = clubKey(name);
    if (!k) return undefined;
    const direct = byKey.get(k);
    if (direct?.length === 1) return direct[0];
    if (direct && direct.length > 1) return undefined;
    // Un alias connu qui ne figure pas dans la liste désigne un autre club.
    if (ALIASES[normalizeClubName(name ?? "")]) return undefined;

    const wanted = new Set(significantTokens(normalizeClubName(name ?? "")));
    const hits = candidates.filter((c) => {
      const t = tokensOf.get(c) ?? [];
      // Un candidat qui a un alias (psg, paris-fc…) ne se rattrape pas par mots.
      if (ALIASES[normalizeClubName(c)]) return false;
      return t.length > 0 && t.every((x) => wanted.has(x));
    });
    return hits.length === 1 ? hits[0] : undefined;
  };
}
