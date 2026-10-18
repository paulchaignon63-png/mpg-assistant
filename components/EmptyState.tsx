"use client";

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-card/50 py-12 px-6 text-center">
      <span className="mb-4 text-5xl" role="img" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      )}
    </div>
  );
}
