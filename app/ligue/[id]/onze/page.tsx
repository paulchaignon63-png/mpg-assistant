"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getLeague, type ManualLeague } from "@/lib/manual-league";

export default function OnzePage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [league, setLeague] = useState<ManualLeague | null | undefined>(undefined);

  useEffect(() => {
    setLeague(getLeague(leagueId) ?? null);
  }, [leagueId]);

  return (
    <div className="min-h-screen bg-[#0A1F1C] px-4 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={`/ligue/${leagueId}`}
          className="mb-6 inline-block text-sm text-[#9CA3AF] hover:text-[#F9FAFB]"
        >
          ← {league?.name ?? "Retour"}
        </Link>

        <div className="rounded-xl border border-[#1F4641] bg-[#0F2F2B]/50 p-8 text-center">
          <span className="mb-4 block text-5xl">🧮</span>
          <h1 className="text-lg font-semibold text-[#F9FAFB]">Calcul du meilleur 11</h1>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Ton effectif est enregistré ({league?.playerIds.length ?? 0} joueurs). Le moteur de
            recommandation — forme, blessures, adversaire — se branche sur cette composition dans la
            prochaine étape.
          </p>
        </div>
      </div>
    </div>
  );
}
