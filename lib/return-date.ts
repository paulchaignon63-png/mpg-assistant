/**
 * Lecture des dates de retour (fin de blessure ou de suspension).
 *
 * Ces dates arrivaient jusqu'ici brutes — souvent le texte entier d'une
 * cellule de tableau — et étaient passées à `new Date()`. Deux conséquences :
 * la plupart donnaient `Invalid Date` (donc aucun effet, en silence), et
 * celles qui passaient étaient lues à l'américaine, "05/09/2026" devenant le
 * 9 mai au lieu du 5 septembre.
 *
 * Le parseur ci-dessous n'accepte que des formats explicites et renvoie null
 * dès qu'il y a le moindre doute. Un null signifie « pas d'information » :
 * l'appelant garde alors le joueur indisponible, ce qui est le sens prudent.
 */

const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, juil: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Année sur 2 chiffres → 20xx (les dates de retour sont toujours proches). */
function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function build(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejette les dates qui débordent (31 février…)
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Extrait une date d'un texte libre.
 *
 * Formats acceptés : ISO (2026-09-05), européen à points ou slashes
 * (05.09.2026, 05/09/2026), et mois écrit en toutes lettres en français ou
 * en anglais (5 septembre 2026, Sep 5, 2026).
 *
 * Les formats à slashes sont lus jour-en-premier : les pages sont demandées
 * avec `Accept-Language: fr-FR` (cf. lib/scrapers/base-scraper.ts), donc les
 * sources répondent en convention européenne. Quand le premier nombre est
 * supérieur à 12, l'ordre est de toute façon certain.
 */
export function parseReturnDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const text = stripAccents(String(raw).toLowerCase()).trim();
  if (!text) return null;

  // ISO : 2026-09-05 (éventuellement suivi d'une heure)
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Mois en toutes lettres, jour d'abord : "5 septembre 2026"
  const dayFirst = text.match(/\b(\d{1,2})\s*(?:er)?\s+([a-z]{3,10})\.?\s+(\d{2,4})\b/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]];
    if (month) return build(expandYear(Number(dayFirst[3])), month, Number(dayFirst[1]));
  }

  // Mois en toutes lettres, mois d'abord : "sep 5, 2026"
  const monthFirst = text.match(/\b([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]];
    if (month) return build(expandYear(Number(monthFirst[3])), month, Number(monthFirst[2]));
  }

  // Numérique séparé par . / ou -
  const numeric = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]));
    if (first > 12 && second <= 12) return build(year, second, first);
    if (second > 12 && first <= 12) return build(year, first, second);
    if (first <= 12 && second <= 12) return build(year, second, first); // convention européenne
    return null;
  }

  return null;
}

/**
 * Le joueur est-il de retour pour ce match ?
 *
 * Vrai uniquement si une date de retour a pu être lue et qu'elle est
 * antérieure au coup d'envoi. Sans date lisible, on répond false : le joueur
 * reste indisponible.
 */
export function hasReturnedBy(
  rawReturnDate: string | undefined | null,
  matchDate: Date | undefined
): boolean {
  if (!matchDate) return false;
  const ret = parseReturnDate(rawReturnDate);
  if (!ret) return false;
  return ret.getTime() <= matchDate.getTime();
}
