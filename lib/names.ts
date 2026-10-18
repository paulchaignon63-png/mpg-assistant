/**
 * Nom court d'un joueur pour l'affichage sur le terrain.
 *
 * Prendre le dernier mot coupait les noms à particule : « Jeffrey de Lange »
 * devenait « Lange », « Branco van den Boomen » devenait « Boomen ». On garde
 * donc les particules qui précèdent le nom de famille, sans jamais avaler le
 * prénom (le premier mot reste toujours hors du nom court).
 */

const PARTICLES = new Set([
  "de", "da", "di", "du", "des", "del", "della", "dos", "das", "do",
  "van", "von", "der", "den", "ter", "ten", "le", "la", "el", "al", "ben", "bin", "ibn", "mac", "st", "saint",
]);

export function shortName(name: string | undefined | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? "";
  let start = parts.length - 1;
  while (start - 1 >= 1 && PARTICLES.has(parts[start - 1].toLowerCase())) start--;
  return parts.slice(start).join(" ");
}
