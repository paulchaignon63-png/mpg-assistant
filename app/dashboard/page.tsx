"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LeagueCard, type LeagueCardData } from "@/components/LeagueCard";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { MatchdayCountdown } from "@/components/MatchdayCountdown";
import type { LeagueStatus } from "@/components/StatusBadge";
import { getLeagueStatus } from "@/lib/league-utils";

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

interface League {
  leagueId?: string;
  divisionId?: string;
  name?: string;
  championshipId?: string;
  teamId?: string;
  usersTeams?: Record<string, string>;
  status?: { status: string };
  mode?: { mode: string };
  nextRealGameWeekDate?: string;
}

type EnrichedLeague = Omit<League, "status"> & { status: LeagueStatus };

export default function DashboardPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const fetchLeagues = async (showRefreshing = false) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("mpg_token") : null;
    if (!token) {
      router.push("/");
      return;
    }
    if (showRefreshing) setRefreshing(true);
    try {
      const userId = localStorage.getItem("mpg_userId");
      const res = await fetch("/api/mpg/dashboard", {
        headers: {
          Authorization: token,
          ...(userId ? { "x-mpg-user-id": userId } : {}),
        },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items = data.leaguesDivisionsItems ?? data.leagues ?? [];
      setLeagues(Array.isArray(items) ? items : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("mpg_token") : null;
    if (!token) {
      router.push("/");
      return;
    }
    fetchLeagues();
  }, [router]);

  const categorized = useMemo(() => {
    const filtered = leagues.filter((l) => {
      const name = (l.name ?? "").toLowerCase();
      const champ = String(l.championshipId ?? "").toLowerCase();
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return name.includes(q) || champ.includes(q);
    });

    const active: EnrichedLeague[] = [];
    const mercato: EnrichedLeague[] = [];
    const finished: EnrichedLeague[] = [];

    for (const league of filtered) {
      const status = getLeagueStatus(league);
      const enriched: EnrichedLeague = { ...league, status };
      if (status === "active") active.push(enriched);
      else if (status === "mercato") mercato.push(enriched);
      else finished.push(enriched);
    }

    return { active, mercato, finished };
  }, [leagues, searchQuery]);

  function handleLogout() {
    localStorage.removeItem("mpg_token");
    localStorage.removeItem("mpg_userId");
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1F1C]">
        <div className="flex flex-col items-center gap-4">
          <span className="inline-block text-5xl animate-spin" role="img" aria-label="Chargement">⚽</span>
          <p className="text-[#9CA3AF]">Chargement de tes ligues...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1F1C] px-4 py-6 sm:px-6 lg:px-8">
      <header className="relative mb-8 flex flex-col items-center gap-4 pt-2 sm:flex-row sm:justify-center">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="" className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
          <div className="text-center sm:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-[#F9FAFB] sm:text-3xl">
              Le 11 parfait
            </h1>
            <p className="mt-1 text-[#9CA3AF]">
              Ton meilleur 11, chaque journée, sans prise de tête
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-[#1F4641] px-4 py-2 text-sm text-[#9CA3AF] transition hover:border-[#1F4641] hover:bg-[#0F2F2B] hover:text-[#F9FAFB] sm:absolute sm:right-0 sm:top-0"
        >
          Déconnexion
        </button>
      </header>

      <main className="mx-auto max-w-3xl">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {leagues.length > 0 && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-[#0F2F2B] p-4">
            <h2 className="mb-2 text-sm font-medium text-[#9CA3AF]">
              Prochaine journée
            </h2>
            <MatchdayCountdown
              championshipId={
                categorized.active.length > 0
                  ? formatChampionshipId(categorized.active[0].championshipId) || "1"
                  : "1"
              }
              leagueName={categorized.active[0]?.name}
              mpgNextRealGameWeekDate={categorized.active[0]?.nextRealGameWeekDate}
            />
          </div>
        )}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <input
            type="search"
            placeholder="Rechercher une ligue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded-lg border border-[#1F4641] bg-[#0F2F2B] px-4 py-2.5 text-[#F9FAFB] placeholder-[#6B7280] focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          <button
            onClick={() => fetchLeagues(true)}
            disabled={refreshing}
            className="rounded-lg bg-[#1F4641] px-4 py-2.5 text-sm font-medium text-[#F9FAFB] transition hover:bg-[#2a5a52] disabled:opacity-50"
          >
            {refreshing ? "Rafraîchissement..." : "Rafraîchir les données"}
          </button>
        </div>

        {leagues.length === 0 ? (
          <EmptyState
            icon="⚽"
            title="Aucune ligue trouvée"
            description="Vérifie que ton compte a des ligues actives sur la plateforme."
          />
        ) : (
          <div className="space-y-10">
            {/* Ligues en cours */}
            <section>
              <SectionHeader
                icon="⚽"
                title="Ligues en cours"
                count={categorized.active.length}
              />
              {categorized.active.length === 0 ? (
                <EmptyState
                  icon="⏸️"
                  title="Aucune ligue en cours"
                  description="Tes ligues jouables apparaîtront ici."
                />
              ) : (
                <div className="space-y-3">
                  {categorized.active.map((league, i) => (
                    <LeagueCard
                      key={league.divisionId ?? league.leagueId ?? i}
                      league={league}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Mercato en cours */}
            <section>
              <SectionHeader
                icon="🔄"
                title="Mercato en cours"
                count={categorized.mercato.length}
              />
              {categorized.mercato.length === 0 ? (
                <EmptyState
                  icon="✅"
                  title="Aucune ligue en mercato"
                  description="Tu as rejoint toutes tes ligues."
                />
              ) : (
                <div className="space-y-3">
                  {categorized.mercato.map((league, i) => (
                    <LeagueCard
                      key={league.divisionId ?? league.leagueId ?? i}
                      league={league}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Ligues terminées */}
            <section>
              <SectionHeader
                icon="🏆"
                title="Ligues terminées"
                count={categorized.finished.length}
              />
              {categorized.finished.length === 0 ? (
                <EmptyState
                  icon="🏅"
                  title="Aucune ligue terminée"
                  description="Tes ligues archivées apparaîtront ici."
                />
              ) : (
                <div className="space-y-3 opacity-90">
                  {categorized.finished.map((league, i) => (
                    <LeagueCard
                      key={league.divisionId ?? league.leagueId ?? i}
                      league={league}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
