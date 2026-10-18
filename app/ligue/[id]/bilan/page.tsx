"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLeague } from "@/lib/client/use-league";
import { ReviewTable, reviewVerdict, useReview } from "@/components/RoundReview";
import { formatFormation } from "@/lib/engine/mpg-rules";

/**
 * Bilan d'après-journée : le pronostic figé quand tu as consulté ta compo,
 * comparé aux vraies notes. On sépare la malchance (écart au pronostic) des
 * choix (écart au meilleur 11 possible avec le même effectif).
 */
export default function ReviewPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [league] = useLeague(leagueId);
  const [index, setIndex] = useState(0);
  const prediction = league?.history[index];
  const { data, error } = useReview(league?.championshipId, prediction);

  if (league === null) return null;

  return (
    <div className="min-h-screen px-4 pb-16 pt-6">
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/ligue/${leagueId}`} className="inline-block text-sm text-muted hover:text-fg">
          ← {league?.name ?? "Retour"}
        </Link>
        <h1 className="text-2xl font-bold text-fg">Bilan</h1>

        {league && league.history.length === 0 && (
          <p className="rounded-xl border border-line bg-card p-4 text-sm text-muted">
            Pas encore de pronostic : ouvre ta compo avant la journée, le bilan apparaîtra ici une fois les matchs joués.
          </p>
        )}

        {league && league.history.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {league.history.map((h, i) => (
              <button
                key={h.seasonRound}
                onClick={() => setIndex(i)}
                className={`shrink-0 rounded-full px-3 py-1 text-sm ${i === index ? "bg-emerald-600 text-white" : "bg-chip text-muted"}`}
              >
                J{h.round}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {prediction && data && (
          <>
            {!data.complete && (
              <p className="rounded-lg bg-card p-3 text-sm text-muted">
                Journée pas encore terminée ({Math.round(data.progress * 100)} % des matchs notés).{" "}
                <Link href={`/ligue/${leagueId}/live`} className="text-accent underline">
                  Suivre en direct
                </Link>
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-line bg-card p-3">
                <div className="text-xl font-bold text-fg tabular-nums">{prediction.teamMean.toFixed(1)}</div>
                <div className="text-[11px] text-subtle">pronostic</div>
              </div>
              <div className="rounded-xl border border-line bg-card p-3">
                <div className="text-xl font-bold text-accent tabular-nums">{data.complete ? data.total.toFixed(1) : "…"}</div>
                <div className="text-[11px] text-subtle">réel</div>
              </div>
              <div className="rounded-xl border border-line bg-card p-3">
                <div className="text-xl font-bold text-fg tabular-nums">{data.complete ? data.best.total.toFixed(1) : "…"}</div>
                <div className="text-[11px] text-subtle">meilleur possible</div>
              </div>
            </div>
            {data.complete && <p className="text-sm text-fg">{reviewVerdict(prediction, data).text}</p>}
            {data.complete && data.rotaldo > 0 && (
              <p className="text-sm text-warn">
                Rotaldo est entré {data.rotaldo} fois : ton banc n&apos;a pas suffi à couvrir les absents.
              </p>
            )}
            <p className="text-xs text-subtle">
              Compo jouée : {formatFormation(prediction.formation)}, pronostic figé le{" "}
              {new Date(prediction.savedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
            </p>
            <ReviewTable prediction={prediction} data={data} />
          </>
        )}
      </div>
    </div>
  );
}
