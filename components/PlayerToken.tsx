import { Jersey } from "./Jersey";

/** Couleur de la jauge selon la probabilité d'être titulaire (4 tranches). */
export function bandColor(pStart: number): string {
  if (pStart >= 0.9) return "#10B981"; // sûr
  if (pStart >= 0.6) return "#A3E635"; // probable
  if (pStart >= 0.4) return "#F59E0B"; // pile ou face
  return "#EF4444"; // peu probable
}

export function bandLabel(pStart: number): string {
  if (pStart >= 0.9) return "Titulaire sûr";
  if (pStart >= 0.6) return "Titulaire probable";
  if (pStart >= 0.4) return "Pile ou face";
  return "Peu probable";
}

/**
 * Maillot entouré d'un anneau qui se remplit avec la probabilité d'être
 * titulaire : on lit le risque du 11 d'un coup d'œil.
 */
export function PlayerToken({
  club,
  pStart,
  size = 44,
  captain = false,
  note,
}: {
  club?: string;
  pStart: number;
  size?: number;
  captain?: boolean;
  note?: number;
}) {
  const ring = size + 10;
  const r = ring / 2 - 2.5;
  const c = 2 * Math.PI * r;
  const color = bandColor(pStart);
  return (
    <div className="relative" style={{ width: ring, height: ring }}>
      <svg width={ring} height={ring} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="3" />
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.02, pStart) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-[5px]">
        <Jersey club={club} size={size} />
      </div>
      {captain && (
        <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-black">
          C
        </span>
      )}
      {note != null && (
        <span className="absolute -bottom-1 -right-1 rounded bg-black/75 px-1 text-[10px] font-bold tabular-nums text-white">
          {note.toFixed(1)}
        </span>
      )}
    </div>
  );
}
