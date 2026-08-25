/**
 * Couleurs de maillot domicile par club, pour dessiner un maillot façon MPG
 * (pas de logo → pas de souci de droits d'image).
 *
 * `primary` = fond du maillot, `secondary` = bandes/accents.
 * Clé = nom de club normalisé (minuscule, sans accent).
 */

export interface ClubColors {
  primary: string;
  secondary: string;
  /** Bandes verticales dans la couleur secondaire. */
  stripes?: boolean;
}

const FALLBACK: ClubColors = { primary: "#1F4641", secondary: "#0F2F2B" };

const COLORS: Record<string, ClubColors> = {
  // Ligue 1 2026-2027
  angers: { primary: "#111827", secondary: "#F9FAFB", stripes: true },
  auxerre: { primary: "#F9FAFB", secondary: "#1D4ED8" },
  brest: { primary: "#D01317", secondary: "#F9FAFB" },
  "le havre": { primary: "#38BDF8", secondary: "#0B2E63" },
  "le mans": { primary: "#D01317", secondary: "#FACC15", stripes: true },
  lens: { primary: "#E01A22", secondary: "#F6C400", stripes: true },
  lille: { primary: "#D01317", secondary: "#0B2E63" },
  lorient: { primary: "#F26522", secondary: "#111827" },
  lyon: { primary: "#F9FAFB", secondary: "#12245C" },
  marseille: { primary: "#F9FAFB", secondary: "#2FAEE0" },
  monaco: { primary: "#E4022E", secondary: "#F9FAFB", stripes: true },
  nice: { primary: "#E01A22", secondary: "#111827" },
  paris: { primary: "#0B1A3F", secondary: "#E30613" }, // PSG
  "paris fc": { primary: "#1D4ED8", secondary: "#0B1A3F" },
  rennes: { primary: "#E4002B", secondary: "#111827", stripes: true },
  strasbourg: { primary: "#1D6DC1", secondary: "#F9FAFB" },
  toulouse: { primary: "#7C3AED", secondary: "#F9FAFB" },
  troyes: { primary: "#1D4ED8", secondary: "#F9FAFB" },
  // Clubs fréquents (montées / autres saisons)
  nantes: { primary: "#F6C400", secondary: "#0B7A3B", stripes: true },
  metz: { primary: "#7A1F2B", secondary: "#F9FAFB" },
  reims: { primary: "#E4002B", secondary: "#111827" },
  montpellier: { primary: "#0B2E63", secondary: "#F26522" },
  "saint-etienne": { primary: "#0B7A3B", secondary: "#F9FAFB" },
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getClubColors(clubName: string | undefined): ClubColors {
  if (!clubName) return FALLBACK;
  const key = normalize(clubName);
  if (COLORS[key]) return COLORS[key];
  // Correspondance partielle (ex. "Stade Rennais" → "rennes")
  for (const [k, v] of Object.entries(COLORS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return FALLBACK;
}
