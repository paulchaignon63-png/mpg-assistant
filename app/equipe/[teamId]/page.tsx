"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AVAILABLE_FORMATIONS, formatFormation, LOW_SCORE_LABELS, type LofteurPlayer, type LowScoreReason } from "@/lib/recommendation";
import { MatchdayCountdown } from "@/components/MatchdayCountdown";

interface SubstitutePlayer {
  name?: string;
  position?: string;
  recommendationScore: number;
  lowScoreReason?: LowScoreReason;
}

interface EnrichedPlayer {
  name?: string;
  position?: string;
  quotation?: number;
  average?: number;
  recommendationScore: number;
}

const posLabels = {
  G: "Gardien",
  D: "Défenseurs",
  M: "Milieux",
  A: "Attaquants",
} as const;

function SubstituteItem({ sub }: { sub: SubstitutePlayer }) {
  const label = sub.lowScoreReason ? LOW_SCORE_LABELS[sub.lowScoreReason] : undefined;
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 text-sm text-[#9CA3AF] ${sub.lowScoreReason ? "italic" : ""}`}
    >
      {sub.lowScoreReason && (
        <span className="text-amber-400" aria-hidden>
          ⚠
        </span>
      )}
      {sub.name ?? "?"} ({sub.recommendationScore.toFixed(1)})
    </span>
  );
}

function ScoreHelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/20 text-base font-semibold text-emerald-400 transition hover:bg-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        aria-label="Comment est calculé le score reco ?"
        aria-expanded={open}
      >
        ?
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-[#1F4641] bg-[#0F2F2B] p-3 shadow-lg"
          role="tooltip"
        >
          <h3 className="mb-1.5 text-xs font-semibold text-emerald-400">
            Comment est calculé le score reco ?
          </h3>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            Notre score combine la forme récente (5 derniers matchs), la
            régularité, les buts et passes selon le poste, et la difficulté du
            prochain adversaire. Les joueurs blessés ou incertains sont exclus
            ou pénalisés.
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-[#1F4641]">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-semibold text-emerald-400">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export default function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [recommended, setRecommended] = useState<EnrichedPlayer[]>([]);
  const [substitutes, setSubstitutes] = useState<Record<string, SubstitutePlayer[]>>({ G: [], D: [], M: [], A: [] });
  const [lofteurs, setLofteurs] = useState<LofteurPlayer[]>([]);
  const [selectedFormation, setSelectedFormation] = useState(343);
  const [loading, setLoading] = useState(true);
  const [formationLoading, setFormationLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const divisionId = searchParams.get("division");
  const championshipId = searchParams.get("championship");
  const leagueNameParam = searchParams.get("leagueName");
  const mpgNextRealGameWeekDate = searchParams.get("nextRealGameWeekDate") ?? undefined;

  useEffect(() => {
    let cancelled = false;
    setLeagueName(leagueNameParam ?? "");
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
            championshipId: championshipId ?? undefined,
            formation: 343,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        if (!cancelled) {
          // #region agent log
          fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({location:"equipe/page.tsx:initialLoad",message:"API response received",data:{hasLofteurs:!!data.lofteurs,lofteursLength:data.lofteurs?.length??0,lofteursSample:data.lofteurs?.slice(0,3)},timestamp:Date.now(),hypothesisId:"H1,H2"})}).catch(()=>{});
          // #endregion
          setTeamName(data.team ?? "Mon équipe");
          setRecommended(data.recommended ?? []);
          setSubstitutes(data.substitutes ?? { G: [], D: [], M: [], A: [] });
          setLofteurs(data.lofteurs ?? []);
          const usedForm = data.formation ?? 343;
          setSelectedFormation((AVAILABLE_FORMATIONS as readonly number[]).includes(usedForm) ? usedForm : 343);
          if (!leagueNameParam) setLeagueName(data.team ?? "");
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, divisionId, championshipId, leagueNameParam, router]);

  async function handleFormationChange(newFormation: number) {
    const prev = selectedFormation;
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/6ee8e683-6091-464b-9212-cd2f05a911be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "equipe/page.tsx:handleFormationChange",
        message: "formation change requested",
        data: { newFormation, prev, teamId, hasTeamId: !!teamId },
        timestamp: Date.now(),
        hypothesisId: "H2,H4",
      }),
    }).catch(() => {});
    // #endregion
    setSelectedFormation(newFormation);
    setFormationLoading(true);
    setError("");
    try {
      const id = teamId;
      if (!id) return;
      const token = typeof window !== "undefined" ? localStorage.getItem("mpg_token") : null;
      if (!token) {
        router.push("/");
        return;
      }
      const res = await fetch("/api/mpg/recommendations", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamId: id,
          divisionId: divisionId ?? undefined,
          championshipId: championshipId ?? undefined,
          formation: newFormation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setRecommended(data.recommended ?? []);
      setSubstitutes(data.substitutes ?? { G: [], D: [], M: [], A: [] });
      setLofteurs(data.lofteurs ?? []);
      const usedForm = data.formation ?? newFormation;
      setSelectedFormation((AVAILABLE_FORMATIONS as readonly number[]).includes(usedForm) ? usedForm : newFormation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSelectedFormation(prev);
    } finally {
      setFormationLoading(false);
    }
  }

  const byPos = {
    G: recommended.filter((p) => p.position === "G"),
    D: recommended.filter((p) => p.position === "D"),
    M: recommended.filter((p) => p.position === "M"),
    A: recommended.filter((p) => p.position === "A"),
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1F1C]">
        <div className="flex flex-col items-center gap-4">
          <span className="inline-block text-5xl animate-spin" role="img" aria-label="Chargement">⚽</span>
          <p className="text-[#9CA3AF]">Chargement des recommandations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0A1F1C] px-4 py-6 sm:px-6 lg:px-8 xl:px-12">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm" aria-label="Fil d'Ariane">
        <Link href="/dashboard" className="shrink-0">
          <img src="/logo.png" alt="Le 11 parfait" className="h-6 w-6" />
        </Link>
        <ol className="flex flex-wrap items-center gap-2 text-[#9CA3AF]">
          <li>
            <Link
              href="/dashboard"
              className="text-emerald-400 transition hover:underline"
            >
              Dashboard
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="truncate text-[#F9FAFB]">
            {leagueName || teamName || "Équipe"}
          </li>
        </ol>
      </nav>

      <main className="mx-auto w-full max-w-[1600px]">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#F9FAFB] sm:text-3xl">
            {leagueName || "Ligue"}
          </h1>
          {teamName && (
            <p className="mt-6 text-lg text-[#9CA3AF]">
              {teamName}
            </p>
          )}
          {championshipId && (
            <div className="mt-4 w-full max-w-2xl mx-auto rounded-xl border border-emerald-500/40 bg-[#0F2F2B] px-5 py-2.5 flex flex-col gap-0.5">
              <h2 className="text-lg font-medium text-[#F9FAFB]">
                Prochaine journée
              </h2>
              <MatchdayCountdown
                championshipId={championshipId}
                mpgNextRealGameWeekDate={mpgNextRealGameWeekDate}
                leagueName={leagueNameParam ?? undefined}
                variant="team"
              />
            </div>
          )}
        </header>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <select
            value={selectedFormation}
            onChange={(e) => handleFormationChange(Number(e.target.value))}
            disabled={formationLoading}
            className="rounded-lg border border-[#1F4641] bg-[#0F2F2B] px-3 py-2 text-[#F9FAFB] focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
          >
            {AVAILABLE_FORMATIONS.map((code) => (
              <option key={code} value={code} className="bg-[#0F2F2B]">
                {formatFormation(code)}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <div
              className="rounded-lg border border-[#1F4641] bg-[#0F2F2B]/50 px-4 py-3 text-sm"
            >
              <span className="text-emerald-400">Évaluation 11</span>
              <span className="text-[#9CA3AF]"> — moyenne de l&apos;app officielle</span>
              <span className="text-[#9CA3AF]"> — cote du joueur</span>
            </div>
            <ScoreHelpButton />
            {formationLoading && (
              <span className="inline-block animate-spin text-lg" aria-hidden>⚽</span>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {(["G", "D", "M", "A"] as const).map((pos) => (
              <section key={pos} className="flex flex-col gap-4">
                <h2 className="text-base font-bold text-emerald-400">
                  {posLabels[pos]}
                </h2>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                  <div className="min-w-0 flex-1 space-y-2">
                    {byPos[pos].map((p, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1F4641] bg-[#0F2F2B] px-4 py-3 transition hover:border-emerald-500/30"
                      >
                        <span className="font-medium text-[#F9FAFB]">
                          {p.name ?? "?"}
                        </span>
                        <div className="flex items-center gap-6">
                          <ScoreBar score={p.recommendationScore} />
                          <span
                            className="text-sm text-[#9CA3AF]"
                            title="Moyenne saison officielle"
                          >
                            Moy: {p.average?.toFixed(1) ?? "-"}
                          </span>
                          {p.quotation != null && (
                            <span
                              className="text-sm text-[#9CA3AF]"
                              title="Cote marchande"
                            >
                              Cote: {p.quotation}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {substitutes[pos] && substitutes[pos].length > 0 && (
                    <div className="shrink-0 sm:min-w-[12rem]">
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6B7280]">
                        Remplaçants
                      </h3>
                      <div className="flex flex-col gap-1.5">
                        {substitutes[pos].map((sub, i) => (
                          <SubstituteItem key={i} sub={sub} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ))}
        </div>

        {lofteurs.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-bold text-[#9CA3AF]">
              Lofteurs
            </h2>
            <p className="mb-3 text-xs text-[#6B7280]">
              Joueurs dans ton équipe mais non retenus (ni titulaires ni remplaçants)
            </p>
            <div className="flex flex-wrap gap-2">
              {[...lofteurs].sort((a, b) => b.recommendationScore - a.recommendationScore).map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#1F4641] bg-[#0F2F2B] px-3 py-2 text-sm text-[#9CA3AF]"
                >
                  <span className="font-medium text-[#F9FAFB]">{p.name ?? "?"}</span>
                  {p.recommendationScore === 0 && p.scoreZeroReason ? (
                    <span title={p.scoreZeroReason === "injured" ? "Blessé" : "Suspendu"} className="inline-flex shrink-0">
                      {p.scoreZeroReason === "injured" ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-white" aria-label="Blessé">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-red-500">
                            <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-red-600" aria-label="Suspendu">
                          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="text-white">
                            <rect width="10" height="14" rx="1" fill="currentColor" />
                          </svg>
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-emerald-400">{p.recommendationScore.toFixed(1)}</span>
                  )}
                </span>
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 text-center text-sm text-[#9CA3AF]">
          Copie cette composition sur ta plateforme avant la prochaine journée !
        </p>
      </main>
    </div>
  );
}
