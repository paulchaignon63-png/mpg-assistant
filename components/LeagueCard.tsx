"use client";

import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { MatchdayCountdown } from "./MatchdayCountdown";
import { getChampionshipDisplay } from "@/lib/league-config";
import type { LeagueStatus } from "./StatusBadge";

export interface LeagueCardData {
  leagueId?: string;
  divisionId?: string;
  name?: string;
  championshipId?: string;
  teamId?: string;
  usersTeams?: Record<string, string>;
  status?: LeagueStatus;
  nextRealGameWeekDate?: string;
}

function formatChampionshipId(champ: unknown): string {
  if (champ == null) return "";
  if (typeof champ === "object" && "value" in champ) {
    return String((champ as { value?: number }).value ?? "");
  }
  if (typeof champ === "object" && "id" in champ) {
    return String((champ as { id?: string | number }).id ?? "");
  }
  return String(champ);
}

interface LeagueCardProps {
  league: LeagueCardData;
  index: number;
}

export function LeagueCard({ league, index }: LeagueCardProps) {
  const divId = league.divisionId ?? league.leagueId ?? "";
  const teamId =
    league.teamId ??
    (league.usersTeams ? Object.values(league.usersTeams)[0] : undefined);
  const champId = formatChampionshipId(league.championshipId);
  const params = new URLSearchParams();
  if (divId) params.set("division", divId);
  if (champId) params.set("championship", champId);
  if (league.name) params.set("leagueName", league.name);
  if (league.nextRealGameWeekDate) params.set("nextRealGameWeekDate", league.nextRealGameWeekDate);
  const href = teamId
    ? `/equipe/${encodeURIComponent(teamId)}?${params.toString()}`
    : "#";

  const isClickable = !!teamId && league.status !== "finished";
  const status = league.status ?? (teamId ? "active" : "mercato");

  const baseCardClass =
    "block rounded-xl border p-5 transition-all duration-200 ";
  const activeCardClass =
    league.status === "active"
      ? "border-emerald-500/30 bg-[#0F2F2B] hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/5"
      : league.status === "mercato"
        ? "border-amber-500/30 bg-[#0F2F2B] hover:border-amber-500/50"
        : "border-[#1F4641] bg-[#0A1F1C] opacity-80";

  const content = (
    <div className={`${baseCardClass} ${activeCardClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
          </div>
          <h3 className="truncate text-lg font-semibold text-[#F9FAFB]">
            {league.name ?? "Ligue"}
          </h3>
          {champId && (() => {
            const display = getChampionshipDisplay(champId);
            return display ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-[#9CA3AF]">
                <img
                  src={`https://flagcdn.com/w40/${display.countryCode}.png`}
                  alt=""
                  width={24}
                  height={18}
                  className="inline-block h-[18px] w-8 shrink-0 rounded-sm object-cover"
                />
                <span>{display.name}</span>
              </p>
            ) : null;
          })()}
          {league.status === "active" && champId && (
            <div className="mt-2">
              <MatchdayCountdown
                championshipId={champId}
                mpgNextRealGameWeekDate={league.nextRealGameWeekDate}
                variant="league"
              />
            </div>
          )}
        </div>
        {isClickable && teamId ? (
          <span className="shrink-0 text-sm font-medium text-emerald-400">
            Voir équipe →
          </span>
        ) : league.status === "mercato" ? (
          <span className="shrink-0 text-xs text-amber-400">
            Équipe non disponible
          </span>
        ) : null}
      </div>
    </div>
  );

  if (isClickable) {
    return (
      <Link
        key={divId || index}
        href={href}
        className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[#0A1F1C] rounded-xl"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      key={divId || index}
      className="cursor-not-allowed"
      title="Équipe non trouvée. La ligue est peut-être en mercato ou tu n'as pas encore rejoint la division."
    >
      {content}
    </div>
  );
}
