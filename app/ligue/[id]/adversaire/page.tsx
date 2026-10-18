"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLeague } from "@/lib/client/use-league";
import { PlayerPicker, usePool } from "@/components/PlayerPicker";
import { ImportPanel } from "@/components/ImportPanel";

/**
 * Effectif de l'adversaire de la journée : le moteur devine son 11 et simule
 * le duel (buts réels + buts MPG) pour donner tes chances de victoire.
 */
export default function OpponentPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [league, update] = useLeague(leagueId);
  const { pool, error } = usePool(league?.championshipId);
  const mine = useMemo(() => new Set(league?.playerIds ?? []), [league]);
  const selected = useMemo(() => new Set(league?.opponentPlayerIds ?? []), [league]);
  // Un joueur ne peut appartenir qu'à une équipe d'une même ligue MPG.
  const available = useMemo(() => (pool ?? []).filter((p) => !mine.has(p.id)), [pool, mine]);
  const [mpgMessage, setMpgMessage] = useState<string | null>(null);

  async function fromMpg() {
    if (!league?.mpg) return;
    setMpgMessage("Recherche de ton adversaire…");
    const q = new URLSearchParams({ divisionId: league.mpg.divisionId, teamId: league.mpg.teamId, championshipId: league.championshipId });
    const res = await fetch(`/api/mpg/opponent?${q}`).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setMpgMessage(d.error ?? "Adversaire introuvable.");
      return;
    }
    update({ opponentPlayerIds: d.playerIds ?? [], opponentName: d.name || league.opponentName });
    setMpgMessage(`Effectif de ${d.name || "ton adversaire"} récupéré (${(d.playerIds ?? []).length} joueurs).`);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ opponentPlayerIds: [...next] });
  }

  if (league === null) return null;
  const count = selected.size;

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/ligue/${leagueId}/onze`} className="inline-block text-sm text-muted hover:text-fg">
          ← Ta compo
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-fg">Ton adversaire</h1>
          <p className="text-sm text-muted">
            Saisis son effectif : on devine son 11 et on simule le match pour te donner tes chances de victoire.
          </p>
        </div>

        {league?.mpg && (
          <div className="rounded-xl border border-line bg-card p-4">
            <button onClick={fromMpg} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white">
              Récupérer mon adversaire depuis MPG
            </button>
            {mpgMessage && <p className="mt-2 text-sm text-muted">{mpgMessage}</p>}
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-line bg-card p-4">
          <label htmlFor="opp-name" className="block text-xs font-medium text-muted">
            Nom de son équipe
          </label>
          <input
            id="opp-name"
            value={league?.opponentName ?? ""}
            onChange={(e) => update({ opponentName: e.target.value })}
            placeholder="Ex. FC Tonton"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder-subtle focus:outline-none"
          />
          <label className="flex items-start gap-3 text-sm text-fg">
            <input
              id="opp-cheat"
              type="checkbox"
              checked={league?.opponentCheatCode ?? false}
              onChange={(e) => update({ opponentCheatCode: e.target.checked })}
              className="mt-1 accent-emerald-500"
            />
            <span>
              Il risque de jouer le <b>Cheat Code 18-26</b>
              <span className="block text-xs text-muted">−0,5 sur chacun de tes joueurs de champ.</span>
            </span>
          </label>
          <p className={`text-sm ${count >= 11 ? "text-accent" : "text-muted"}`}>
            {count} joueur{count > 1 ? "s" : ""} saisi{count > 1 ? "s" : ""}
            {count < 11 && ` — il en faut au moins 11 pour simuler le duel.`}
          </p>
          {count > 0 && (
            <button
              onClick={() => update({ opponentPlayerIds: [], opponentName: "", opponentCheatCode: false })}
              className="text-xs text-danger underline"
            >
              Effacer l&apos;adversaire
            </button>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {pool && (
          <>
            <ImportPanel
              title="Importer son effectif"
              pool={available}
              onImport={(ids) => update({ opponentPlayerIds: [...new Set([...(league?.opponentPlayerIds ?? []), ...ids])] })}
            />
            <PlayerPicker pool={available} selected={selected} onToggle={toggle} />
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Link
            href={`/ligue/${leagueId}/onze`}
            className="block w-full rounded-lg bg-emerald-600 px-4 py-3 text-center font-medium text-white"
          >
            Voir mes chances
          </Link>
        </div>
      </div>
    </div>
  );
}
