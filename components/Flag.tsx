/**
 * Drapeaux en SVG. Les emoji drapeaux ne s'affichent pas sous Windows (on y
 * voit « FR », « ES »…), d'où ces dessins simples, identiques partout.
 */
export function Flag({ code, size = 22 }: { code: string; size?: number }) {
  const h = Math.round((size * 2) / 3);
  const common = {
    width: size,
    height: h,
    viewBox: "0 0 30 20",
    "aria-hidden": true,
    className: "shrink-0 rounded-[3px] ring-1 ring-black/10",
  } as const;

  switch (code) {
    case "fr":
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#0055A4" />
          <rect x="10" width="10" height="20" fill="#FFFFFF" />
          <rect x="20" width="10" height="20" fill="#EF4135" />
        </svg>
      );
    case "it":
      return (
        <svg {...common}>
          <rect width="10" height="20" fill="#009246" />
          <rect x="10" width="10" height="20" fill="#FFFFFF" />
          <rect x="20" width="10" height="20" fill="#CE2B37" />
        </svg>
      );
    case "es":
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#AA151B" />
          <rect y="5" width="30" height="10" fill="#F1BF00" />
        </svg>
      );
    case "gb":
      // Premier League : croix de Saint-Georges (Angleterre).
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#FFFFFF" />
          <rect x="12.5" width="5" height="20" fill="#CE1124" />
          <rect y="7.5" width="30" height="5" fill="#CE1124" />
        </svg>
      );
    case "tr":
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#E30A17" />
          <circle cx="11" cy="10" r="5" fill="#FFFFFF" />
          <circle cx="12.3" cy="10" r="4" fill="#E30A17" />
          <polygon points="17.2,8.2 18.6,10.9 15.9,9.3 19.2,9.3 16.5,10.9" fill="#FFFFFF" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="currentColor" opacity="0.2" />
        </svg>
      );
  }
}
