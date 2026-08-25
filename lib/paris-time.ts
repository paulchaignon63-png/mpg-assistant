/**
 * Conversion des heures "murales" françaises vers des instants UTC.
 *
 * Les sources scrapées (Foot Mercato, L'Equipe, Eurosport) affichent leurs
 * horaires en heure de Paris. Le constructeur `new Date(y, m, d, h, min)`
 * interprète ces composantes dans le fuseau du process — UTC sur les lambdas
 * Vercel. Sans conversion explicite, un coup d'envoi à 20h45 à Paris devenait
 * 20h45 UTC, soit 22h45 à Paris : la deadline annoncée tombait après le début
 * du match.
 */

const PARIS_TIME_ZONE = "Europe/Paris";

const PARIS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Décalage Europe/Paris ↔ UTC, en millisecondes, à un instant donné. */
function parisOffsetMs(at: Date): number {
  const parts = PARIS_FORMATTER.formatToParts(at);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - at.getTime();
}

/**
 * Construit un instant UTC à partir de composantes lues en heure de Paris.
 * `month` est 1-indexé. Gère les bascules heure d'été / heure d'hiver : le
 * décalage est d'abord estimé sur l'instant naïf, puis recalculé sur le
 * résultat au cas où l'on aurait franchi une bascule.
 */
export function parisDateToUtc(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const firstPass = new Date(naive - parisOffsetMs(new Date(naive)));
  return new Date(naive - parisOffsetMs(firstPass));
}
