import { getClubColors } from "@/lib/club-colors";

/** Maillot stylisé aux couleurs du club (pas de logo → pas de droits d'image). */
export function Jersey({
  club,
  size = 46,
}: {
  club?: string;
  size?: number;
}) {
  const { primary, secondary, stripes } = getClubColors(club);
  const gid = `j-${(club ?? "x").replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <clipPath id={gid}>
          <path d="M17 6 L10 10 L5 18 L11 22 L14 19 L14 40 Q14 42 16 42 L32 42 Q34 42 34 40 L34 19 L37 22 L43 18 L38 10 L31 6 Q24 12 17 6 Z" />
        </clipPath>
      </defs>

      {/* Corps du maillot */}
      <path
        d="M17 6 L10 10 L5 18 L11 22 L14 19 L14 40 Q14 42 16 42 L32 42 Q34 42 34 40 L34 19 L37 22 L43 18 L38 10 L31 6 Q24 12 17 6 Z"
        fill={primary}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1"
      />

      {/* Bandes verticales (clippées à la forme du maillot) */}
      {stripes && (
        <g clipPath={`url(#${gid})`}>
          <rect x="19" y="4" width="4" height="42" fill={secondary} opacity="0.9" />
          <rect x="27" y="4" width="4" height="42" fill={secondary} opacity="0.9" />
        </g>
      )}

      {/* Col */}
      <path d="M17 6 Q24 12 31 6" fill="none" stroke={secondary} strokeWidth="2.5" />
    </svg>
  );
}
