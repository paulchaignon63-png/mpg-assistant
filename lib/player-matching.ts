/**
 * Rapprochement entre les noms fournis par les sources de statut (blessés,
 * suspendus, « de retour ») et les joueurs de l'effectif.
 *
 * L'ancienne règle acceptait un match dès qu'un nom était sous-chaîne de
 * l'autre. Un nom de famille seul suffisait donc à contaminer tous ses
 * homonymes : une entrée « Diallo » marquait Abdoulaye, Habib et Mamadou
 * Diallo d'un coup — dans les deux sens, puisque la même règle servait à
 * retirer des joueurs des listes de blessés.
 *
 * Nouvelle règle, par ordre de confiance :
 *   1. nom complet identique ;
 *   2. au moins deux tokens significatifs en commun ;
 *   3. entrée réduite à un seul token (nom de famille seul) : acceptée
 *      uniquement si elle ne peut désigner qu'un joueur de l'effectif.
 *
 * Quand une entrée reste ambiguë, elle est ignorée : mieux vaut manquer une
 * absence que mettre trois homonymes sur le banc.
 */

/** Particules trop courantes pour identifier un joueur à elles seules. */
const STOP_TOKENS = new Set(["van", "von", "der", "den", "dos", "das", "ben", "abd"]);

/** Longueur minimale d'un token pour être considéré comme discriminant. */
const MIN_TOKEN_LENGTH = 3;

export interface StatusEntry {
  playerName: string;
  clubName?: string;
}

export interface PlayerRef {
  name?: string;
  clubName?: string;
}

/** Minuscules, sans accents ni ponctuation, espaces normalisés. */
export function normalizePlayerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens retenus pour l'identification (assez longs, hors particules). */
export function significantTokens(key: string): string[] {
  return key
    .split(" ")
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOP_TOKENS.has(t));
}

/** Deux libellés de club désignent-ils le même club ? */
export function clubsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizePlayerKey(a);
  const nb = normalizePlayerKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Les sources écrivent "Paris Saint-Germain", "PSG", "Paris SG"… on tolère
  // l'inclusion ici : le club ne sert qu'à départager, jamais à matcher seul.
  return na.includes(nb) || nb.includes(na);
}

/**
 * Clubs compatibles : si l'un des deux est inconnu on ne peut pas trancher,
 * donc on ne rejette pas.
 */
function clubsCompatible(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return true;
  return clubsMatch(a, b);
}

interface Indexed {
  index: number;
  key: string;
  tokens: string[];
  clubName?: string;
}

function indexPlayers(players: PlayerRef[]): Indexed[] {
  const out: Indexed[] = [];
  players.forEach((p, index) => {
    const name = p.name?.trim();
    if (!name) return;
    const key = normalizePlayerKey(name);
    if (!key) return;
    out.push({ index, key, tokens: significantTokens(key), clubName: p.clubName });
  });
  return out;
}

/**
 * Associe chaque entrée de statut au(x) joueur(s) de l'effectif qu'elle désigne.
 * Retourne les index des joueurs concernés, avec l'entrée à l'origine du match.
 */
export function resolveEntriesToPlayers<E extends StatusEntry>(
  players: PlayerRef[],
  entries: E[]
): Map<number, E> {
  const resolved = new Map<number, E>();
  if (entries.length === 0) return resolved;

  const indexed = indexPlayers(players);
  if (indexed.length === 0) return resolved;

  for (const entry of entries) {
    const rawName = entry.playerName?.trim();
    if (!rawName) continue;
    const entryKey = normalizePlayerKey(rawName);
    if (!entryKey) continue;
    const entryTokens = significantTokens(entryKey);
    if (entryTokens.length === 0) continue;

    const candidates = indexed.filter((p) => clubsCompatible(entry.clubName, p.clubName));
    if (candidates.length === 0) continue;

    // 1. Nom complet identique
    const exact = candidates.filter((p) => p.key === entryKey);
    if (exact.length > 0) {
      for (const p of exact) if (!resolved.has(p.index)) resolved.set(p.index, entry);
      continue;
    }

    // 2. Au moins deux tokens significatifs en commun
    const twoTokens = candidates.filter(
      (p) => p.tokens.filter((t) => entryTokens.includes(t)).length >= 2
    );
    if (twoTokens.length === 1) {
      if (!resolved.has(twoTokens[0].index)) resolved.set(twoTokens[0].index, entry);
      continue;
    }
    if (twoTokens.length > 1) continue; // ambigu → on ne touche à personne

    // 3. Nom de famille seul : accepté seulement s'il ne désigne qu'un joueur
    if (entryTokens.length !== 1) continue;
    const token = entryTokens[0];
    const single = candidates.filter((p) => p.tokens.includes(token));
    if (single.length === 1 && !resolved.has(single[0].index)) {
      resolved.set(single[0].index, entry);
    }
  }

  return resolved;
}

/** Variante pour les sources qui ne fournissent qu'une liste de noms. */
export function resolveNamesToPlayers(
  players: PlayerRef[],
  names: string[]
): Map<number, StatusEntry> {
  return resolveEntriesToPlayers(
    players,
    names.map((playerName) => ({ playerName }))
  );
}
