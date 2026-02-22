"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface League {
  leagueId?: string;
  divisionId?: string;
  name?: string;
  championshipId?: string;
  teamId?: string;
  usersTeams?: Record<string, string>;
}

export default function DashboardPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("mpg_token") : null;
    if (!token) {
      router.push("/");
      return;
    }
    const userId = localStorage.getItem("mpg_userId");
    fetch("/api/mpg/dashboard", {
      headers: {
        Authorization: token,
        ...(userId ? { "x-mpg-user-id": userId } : {}),
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const items = data.leaguesDivisionsItems ?? data.leagues ?? [];
        setLeagues(Array.isArray(items) ? items : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("mpg_token");
    localStorage.removeItem("mpg_userId");
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <p className="text-slate-400">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 to-slate-900 p-4">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold text-emerald-400">Fantasy Assistant MPG</h1>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
        >
          Déconnexion
        </button>
      </header>

      <main className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 p-4 text-red-400">{error}</div>
        )}

        <h2 className="mb-4 text-lg font-medium text-slate-200">Tes ligues</h2>

        {leagues.length === 0 ? (
          <p className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-slate-400">
            Aucune ligue trouvée. Vérifie que ton compte MPG a des ligues actives.
          </p>
        ) : (
          <div className="space-y-3">
            {leagues.map((league, i) => {
              const divId = league.divisionId ?? league.leagueId ?? "";
              const teamId = league.teamId ?? (league.usersTeams ? Object.values(league.usersTeams)[0] : undefined);
              const champ = league.championshipId;
              const champId = typeof champ === "object" && champ && "value" in champ
                ? String((champ as { value?: number }).value ?? "")
                : String(champ ?? "");
              const href = teamId
                ? `/equipe/${encodeURIComponent(teamId)}?division=${encodeURIComponent(divId)}&championship=${encodeURIComponent(champId)}`
                : "#";
              const content = (
                <div className="block rounded-xl border border-slate-700 bg-slate-800/50 p-4 transition hover:border-emerald-600/50 hover:bg-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">{league.name ?? "Ligue"}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {league.championshipId ?? ""}
                      </div>
                    </div>
                    {teamId && (
                      <span className="text-sm font-medium text-emerald-400">
                        Voir mon équipe →
                      </span>
                    )}
                  </div>
                </div>
              );
              return teamId ? (
                <Link key={divId || i} href={href} className="block cursor-pointer">
                  {content}
                </Link>
              ) : (
                <div key={divId || i} className="opacity-75 cursor-not-allowed" title="Impossible de récupérer l'équipe pour cette ligue">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
