"use client";

interface SectionHeaderProps {
  icon: string;
  title: string;
  count?: number;
}

export function SectionHeader({ icon, title, count }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="text-2xl" role="img" aria-hidden>
        {icon}
      </span>
      <h2 className="text-lg font-bold text-[#F9FAFB] tracking-tight">
        {title}
      </h2>
      {count != null && count > 0 && (
        <span className="rounded-full bg-[#1F4641] px-2.5 py-0.5 text-sm text-[#9CA3AF]">
          {count}
        </span>
      )}
    </div>
  );
}
