"use client";

import { useEffect, useState } from "react";

interface MatchdayCountdownProps {
  championshipId: string | number;
  leagueName?: string;
  mpgNextRealGameWeekDate?: string;
  compact?: boolean;
}

interface BreakStatusData {
  type: string;
  message: string;
  resumeDate: string | null;
}

interface DeadlineData {
  deadline: string | null;
  firstMatchDate: string | null;
  gameWeek: number | null;
  source: string | null;
  breakStatus: BreakStatusData | null;
}

function formatCountdown(deadline: Date): string {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();

  if (diff <= 0) return "Compos figées - en cours";

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days}j ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDeadlineShort(deadline: Date): string {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const dayName = days[deadline.getDay()];
  const hours = deadline.getHours().toString().padStart(2, "0");
  const minutes = deadline.getMinutes().toString().padStart(2, "0");
  return `${dayName} ${hours}h${minutes}`;
}

export function MatchdayCountdown({
  championshipId,
  leagueName,
  mpgNextRealGameWeekDate,
  compact = false,
}: MatchdayCountdownProps) {
  const [data, setData] = useState<DeadlineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;

    const fetchDeadline = async () => {
      const params = new URLSearchParams({
        championshipId: String(championshipId),
      });
      if (mpgNextRealGameWeekDate) {
        params.set("mpgNextRealGameWeekDate", mpgNextRealGameWeekDate);
      }
      try {
        const res = await fetch(`/api/matchday-deadline?${params.toString()}`);
        const json = await res.json();
        if (!cancelled) {
          setData({
            deadline: json.deadline ?? null,
            firstMatchDate: json.firstMatchDate ?? null,
            gameWeek: json.gameWeek ?? null,
            source: json.source ?? null,
            breakStatus: json.breakStatus ?? null,
          });
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDeadline();

    const interval = setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [championshipId, mpgNextRealGameWeekDate]);

  if (loading) {
    return (
      <span className="text-xs text-[#6B7280] animate-pulse">
        Chargement...
      </span>
    );
  }

  if (!data?.deadline) {
    if (data?.breakStatus?.message) {
      const resumeStr = data.breakStatus.resumeDate
        ? ` Reprise ~${new Date(data.breakStatus.resumeDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}.`
        : "";
      return (
        <span
          className="text-xs text-amber-400/90"
          title={data.breakStatus.message + resumeStr}
        >
          {compact ? data.breakStatus.message : `${data.breakStatus.message}${resumeStr}`}
        </span>
      );
    }
    return <span className="text-xs text-[#6B7280]">-</span>;
  }

  const deadlineDate = new Date(data.deadline);
  const countdown = formatCountdown(deadlineDate);
  const short = formatDeadlineShort(deadlineDate);

  if (countdown === "Compos figées - en cours") {
    return (
      <span className="text-xs text-amber-400/90">
        Compos figées - en cours
      </span>
    );
  }

  if (compact) {
    return (
      <span className="text-xs text-emerald-400/90" title={`Compo ferme ${short}`}>
        {short}
      </span>
    );
  }

  return (
    <span className="text-xs text-emerald-400/90">
      Compo ferme dans <strong>{countdown}</strong>
      {data.gameWeek != null && (
        <span className="ml-1 text-[#9CA3AF]">(J{data.gameWeek})</span>
      )}
    </span>
  );
}
