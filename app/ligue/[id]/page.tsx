"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { exportLeagueCode, type RosterPlayer } from "@/lib/manual-league";
import { getChampionshipById } from "@/lib/championships";
import { useLeague } from "@/lib/client/use-league";
import { usePool, PlayerRow } from "@/components/PlayerPicker";
import { Flag } from "@/components/Flag";
import { PushToggle } from "@/components/PushToggle";

const POS_ORDER: Array<"G" | "D" | "M" | "A"> = ["G", "D", "M", "A"];
const POS_LABEL: Record<string, string> = { G: "Gardiens", D: "Défenseurs", M: "Milieux", A: "Attaquants" };
/** Effectif MPG type : 2 G, 6 D, 6 M, 4 A minimum pour couvrir le banc. */
const MIN_BY_POS: Record<string, number> = { G: 2, D: 6, M: 6, A: 4 };

export default function LeaguePage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [league] = useLeague(leagueId);
  const { pool } = usePool(league?.championshipId);
  const [copied, setCopied] = useState(false);

  const squad = useMemo(() => {
    if (!league || !pool) return null;
    const ids = new Set(league.playerIds);
    const byPos: Record<string, RosterPlayer[]> = { G: [], D: [], M: [], A: [] };
    for (const p of pool) if (ids.has(p.id)) byPos[p.position].push(p);
    for (const k of POS_ORDER) byPos[k].sort((a, b) => (b.quotation ?? 0) - (a.quotation ?? 0));
    return byPos;
  }, [league, pool]);

  if (league === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted">
        <div>
          <p>Ligue introuvable.</p>
          <Link href="/" className="mt-3 inline-block text-accent">
            ← Mes ligues
          </Link>
        </div>
      </div>
    );
  }

  const champ = league ? getChampionshipById(league.championshipId) : undefined;
  const count = league?.playerIds.length ?? 0;
  const gaps = squad ? POS_ORDER.filter((p) => squad[p].length < MIN_BY_POS[p]) : [];
  const lastPrediction = league?.history[0];

  async function share() {
    if (!league) return;
    const code = exportLeagueCode(league);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      window.prompt("Copie ce code", code);
    }
  }

  const actions = [
    { href: `/ligue/${leagueId}/bonus`, title: "Bonus", text: "Quand jouer tes bonus" },
    { href: `/ligue/${leagueId}/live`, title: "En direct", text: "Ta journée en cours" },
    { href: `/ligue/${leagueId}/bilan`, title: "Bilan", text: lastPrediction ? `Dernier pronostic : J${lastPrediction.round}` : "Après chaque journée" },
  ];

  return (
    <div className="min-h-screen px-4 pb-28 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-5 inline-block text-sm text-muted hover:text-fg">
          ← Mes ligues
        </Link>

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-fg">{league?.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted">
            {champ && <Flag code={champ.countryCode} size={18} />}
            {champ?.name} · {count} joueur{count > 1 ? "s" : ""}
          </p>
        </div>

        {count === 0 ? (
          <div className="rounded-xl border border-line bg-card p-6 text-center">
            <p className="text-muted">Ton effectif est vide. Ajoute tes joueurs un par un, colle une liste ou importe une capture d&apos;écran.</p>
            <Link
              href={`/ligue/${leagueId}/effectif`}
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-500"
            >
              Composer l&apos;effectif
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {actions.map((a) => (
                <Link key={a.href} href={a.href} className="rounded-xl border border-line bg-card p-3 transition hover:border-emerald-500/50">
                  <span className="block text-sm font-semibold text-fg">{a.title}</span>
                  <span className="block truncate text-xs text-muted">{a.text}</span>
                </Link>
              ))}
            </div>

            <div className="mt-3">
              <PushToggle league={league ?? undefined} />
            </div>

            {gaps.length > 0 && (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-warn">
                Effectif court en {gaps.map((g) => POS_LABEL[g].toLowerCase()).join(", ")} : le banc risque de ne pas couvrir un absent (Rotaldo à 2,5).
              </p>
            )}

            <div className="mt-6 space-y-5">
              {squad &&
                POS_ORDER.map((pos) =>
                  squad[pos].length === 0 ? null : (
                    <div key={pos}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                        {POS_LABEL[pos]} ({squad[pos].length})
                      </p>
                      <div className="space-y-1.5">
                        {squad[pos].map((p) => (
                          <PlayerRow key={p.id} player={p} selected={false} />
                        ))}
                      </div>
                    </div>
                  )
                )}
            </div>

            <button onClick={share} className="mt-6 w-full rounded-lg border border-line bg-card py-2 text-sm text-muted">
              {copied ? "Code copié : colle-le dans l'extension ou sur un autre appareil" : "Copier le code de partage de la ligue"}
            </button>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <Link
            href={`/ligue/${leagueId}/effectif`}
            className="flex-1 rounded-lg border border-line bg-card px-4 py-3 text-center font-medium text-fg transition hover:border-emerald-500/50"
          >
            Effectif
          </Link>
          <Link
            href={`/ligue/${leagueId}/onze`}
            aria-disabled={count === 0}
            className={`flex-[2] rounded-lg px-4 py-3 text-center font-medium transition ${
              count === 0 ? "pointer-events-none bg-chip text-subtle" : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
          >
            Mon meilleur 11
          </Link>
        </div>
      </div>
    </div>
  );
}
