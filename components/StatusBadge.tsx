"use client";

export type LeagueStatus = "active" | "mercato" | "finished";

const config: Record<
  LeagueStatus,
  { label: string; icon: string; className: string }
> = {
  active: {
    label: "Actif",
    icon: "⚽",
    className:
      "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  mercato: {
    label: "Mercato",
    icon: "🔄",
    className:
      "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  finished: {
    label: "Terminé",
    icon: "🏆",
    className:
      "bg-slate-500/20 text-slate-400 border-slate-500/40",
  },
};

export function StatusBadge({ status }: { status: LeagueStatus }) {
  const { label, icon, className } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <span>{icon}</span>
      {label}
    </span>
  );
}
