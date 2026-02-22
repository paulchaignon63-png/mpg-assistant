"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface EnrichedPlayer {
  name?: string;
  position?: string;
  quotation?: number;
  average?: number;
  recommendationScore: number;
}

export default function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [recommended, setRecommended] = useState<EnrichedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const divisionId = searchParams.get("division");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { teamId: id } = await params;
      setTeamId(id);
      const token =
        typeof window !== "undefined" ? localStorage.getItem("mpg_token") : null;
      if (!token) {
        router.push("/");
        return;
      }
      try {
        const res = await fetch("/api/mpg/recommendations", {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teamId: id,
            divisionId: divisionId ?? undefined,
            formation: 343,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        if (!cancelled) {
          setTeamName(data.team ?? "Mon équipe");
          setRecommended(data.recommended ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, divisionId, router]);

  const byPos = {
    G: recommended.filter((p) => p.position === "G"),
    D: recommended.filter((p) => p.position === "D"),
    M: recommended.filter((p) => p.position === "M"),
    A: recommended.filter((p) => p.position === "A"),
  };

  const posLabels = { G: "Gardien", D: "Défenseurs", M: "Milieux", A: "Attaquants" };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <p className="text-slate-400">Chargement des recommandations...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 to-slate-900 p-4">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-emerald-400 hover:underline"
        >
          ← Retour au dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-2xl">
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 p-4 text-red-400">
            {error}
          </div>
        )}

        <h1 className="mb-2 text-2xl font-bold text-white">{teamName}</h1>
        <p className="mb-6 text-slate-400">Meilleur 11 recommandé (formation 3-4-3)</p>

        <div className="space-y-6">
          {(["G", "D", "M", "A"] as const).map((pos) => (
            <div key={pos}>
              <h2 className="mb-2 text-sm font-medium text-emerald-400">
                {posLabels[pos]}
              </h2>
              <div className="space-y-2">
                {byPos[pos].map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3"
                  >
                    <span className="font-medium text-white">{p.name ?? "?"}</span>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>Note moy: {p.average?.toFixed(1) ?? "-"}</span>
                      <span>Score: {p.recommendationScore.toFixed(2)}</span>
                      {p.quotation != null && (
                        <span>Q: {p.quotation}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          Copie cette composition dans MPG avant la prochaine journée !
        </p>
      </main>
    </div>
  );
}
