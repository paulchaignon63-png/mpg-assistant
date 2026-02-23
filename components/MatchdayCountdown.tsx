"use client";

import { useEffect, useState } from "react";

interface MatchdayCountdownProps {
  championshipId: string | number;
  leagueName?: string;
  mpgNextRealGameWeekDate?: string;
  compact?: boolean;
  showFullDate?: boolean;
  variant?: "compact" | "default" | "dashboard" | "team" | "league";
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

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

function getCountdownParts(deadline: Date, now: Date): CountdownParts {
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    isExpired: false,
  };
}

function formatCountdown(deadline: Date, now: Date): string {
  const { days, hours, minutes, isExpired } = getCountdownParts(deadline, now);
  if (isExpired) return "Compos figées - en cours";
  if (days > 0) return `${days}j ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format avec secondes pour un affichage qui défile en temps réel */
function formatCountdownWithSeconds(deadline: Date, now: Date): string {
  const { days, hours, minutes, seconds, isExpired } = getCountdownParts(deadline, now);
  if (isExpired) return "Compos figées - en cours";
  if (days > 0) return `${days}j ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Couleur du compte à rebours selon le temps restant avant le deadline */
function getCountdownColorClass(deadline: Date, now: Date): string {
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return "text-amber-400/90"; // expiré
  const hoursRemaining = diffMs / (1000 * 60 * 60);
  if (hoursRemaining >= 24) return "text-emerald-400";
  if (hoursRemaining >= 12) return "text-yellow-400";
  if (hoursRemaining >= 2) return "text-orange-400";
  return "text-red-400";
}

function formatDeadlineShort(deadline: Date): string {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const dayName = days[deadline.getDay()];
  const hours = deadline.getHours().toString().padStart(2, "0");
  const minutes = deadline.getMinutes().toString().padStart(2, "0");
  return `${dayName} ${hours}h${minutes}`;
}

function formatDeadlineFull(deadline: Date): string {
  const str = deadline.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function MatchdayCountdown({
  championshipId,
  leagueName,
  mpgNextRealGameWeekDate,
  compact = false,
  showFullDate = false,
  variant = "default",
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

    const tickInterval = ["dashboard", "team", "league"].includes(variant ?? "") ? 1000 : 60 * 1000;
    const interval = setInterval(() => {
      setNow(new Date());
    }, tickInterval);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [championshipId, mpgNextRealGameWeekDate, variant]);

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
  const matchdayDate = data.firstMatchDate
    ? new Date(data.firstMatchDate)
    : deadlineDate;
  const countdown = formatCountdown(deadlineDate, now);
  const short = formatDeadlineShort(deadlineDate);

  if (variant === "dashboard") {
    const parts = getCountdownParts(deadlineDate, now);
    if (parts.isExpired) {
      return (
        <span className="text-xl font-semibold text-amber-400/90">
          Compos figées - en cours
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
        {parts.days > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-4xl font-bold tabular-nums text-emerald-400 sm:text-5xl">
              {parts.days}
            </span>
            <span className="text-xs uppercase tracking-wider text-[#9CA3AF]">jours</span>
          </div>
        )}
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold tabular-nums text-emerald-400 sm:text-5xl">
            {String(parts.hours).padStart(2, "0")}
          </span>
          <span className="text-xs uppercase tracking-wider text-[#9CA3AF]">heures</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold tabular-nums text-emerald-400 sm:text-5xl">
            {String(parts.minutes).padStart(2, "0")}
          </span>
          <span className="text-xs uppercase tracking-wider text-[#9CA3AF]">minutes</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold tabular-nums text-emerald-400 sm:text-5xl">
            {String(parts.seconds).padStart(2, "0")}
          </span>
          <span className="text-xs uppercase tracking-wider text-[#9CA3AF]">secondes</span>
        </div>
        {data.gameWeek != null && (
          <span className="self-end text-sm text-[#9CA3AF]">Journée {data.gameWeek}</span>
        )}
      </div>
    );
  }

  if (countdown === "Compos figées - en cours") {
    return (
      <span className={variant === "team" ? "text-lg text-amber-400/90" : "text-xs text-amber-400/90"}>
        Compos figées - en cours
      </span>
    );
  }

  if (variant === "team") {
    const colorClass = getCountdownColorClass(deadlineDate, now);
    const countdownText = formatCountdownWithSeconds(deadlineDate, now);
    return (
      <span className="text-lg text-[#F9FAFB]">
        Compo ferme dans <strong className={`tabular-nums ${colorClass}`}>{countdownText}</strong>
        {data.gameWeek != null && (
          <span className={`ml-1 ${colorClass} opacity-90`}>(J{data.gameWeek})</span>
        )}
      </span>
    );
  }

  if (variant === "league") {
    const colorClass = getCountdownColorClass(deadlineDate, now);
    const countdownText = formatCountdownWithSeconds(deadlineDate, now);
    return (
      <span className="text-xs text-[#9CA3AF]">
        Compo ferme dans <strong className={`tabular-nums ${colorClass}`}>{countdownText}</strong>
        {data.gameWeek != null && (
          <span className={`ml-1 ${colorClass} opacity-90`}>(J{data.gameWeek})</span>
        )}
      </span>
    );
  }

  if (compact) {
    const displayText = showFullDate ? formatDeadlineFull(matchdayDate) : short;
    return (
      <span className="text-xs text-emerald-400/90" title={showFullDate ? undefined : `Compo ferme ${short}`}>
        {displayText}
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
