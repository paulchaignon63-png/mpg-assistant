"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createLeague, getLeague, updateLeague } from "@/lib/manual-league";
import { getChampionshipById } from "@/lib/championships";
import { notifyLeagues } from "@/lib/client/use-league";
import { Flag } from "@/components/Flag";

interface MpgLeague {
  name: string;
  divisionId: string;
  teamId?: string;
  championshipId: string;
  status?: string;
}

function ImportMpg() {
  const router = useRouter();
  const target = useSearchParams().get("ligue");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<MpgLeague[] | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mpg/auth")
      .then((r) => r.json())
      .then((d) => setConnected(!!d.connected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/mpg/leagues")
      .then(async (r) => {
        const d = await r.json();
        if (r.status === 401) setConnected(false);
        else if (!r.ok) setError(d.error ?? "Ligues indisponibles.");
        else setLeagues(d.leagues ?? []);
      })
      .catch(() => setError("MPG ne répond pas."));
  }, [connected]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mpg/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Connexion refusée.");
      else {
        setPassword("");
        setConnected(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/mpg/auth", { method: "DELETE" });
    setConnected(false);
    setLeagues(null);
  }

  async function importLeague(l: MpgLeague) {
    if (!l.teamId) return;
    setImporting(l.divisionId);
    setError(null);
    try {
      const res = await fetch(`/api/mpg/import?teamId=${encodeURIComponent(l.teamId)}&championshipId=${l.championshipId}`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Import impossible.");
        return;
      }
      const mpg = { teamId: l.teamId, divisionId: l.divisionId, leagueName: l.name };
      let id: string;
      if (target && getLeague(target)) {
        updateLeague(target, { playerIds: d.playerIds, mpg, bonuses: d.bonuses ?? {}, championshipId: l.championshipId });
        id = target;
      } else {
        id = createLeague({ name: l.name, championshipId: l.championshipId, playerIds: d.playerIds, mpg }).id;
        updateLeague(id, { bonuses: d.bonuses ?? {} });
      }
      notifyLeagues();
      if (d.unmatched?.length) {
        setError(`Importé, sauf ${d.unmatched.length} joueur(s) non reconnu(s) : ${d.unmatched.slice(0, 5).join(", ")}. Ajoute-les à la main.`);
        setTimeout(() => router.push(`/ligue/${id}`), 2500);
      } else {
        router.push(`/ligue/${id}`);
      }
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-6">
      <div className="mx-auto max-w-md space-y-5">
        <Link href={target ? `/ligue/${target}/effectif` : "/"} className="inline-block text-sm text-muted hover:text-fg">
          ← Retour
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-fg">Importer depuis MPG</h1>
          <p className="text-sm text-muted">
            Récupère ton effectif, tes bonus et ton adversaire de la journée, et envoie ta compo sur MPG en un geste.
          </p>
        </div>

        {connected === null && <div className="h-32 animate-pulse rounded-xl bg-card" />}

        {connected === false && (
          <form onSubmit={signIn} className="space-y-3 rounded-xl border border-line bg-card p-4">
            <div>
              <label htmlFor="mpg-email" className="mb-1 block text-xs font-medium text-muted">
                Email MPG
              </label>
              <input
                id="mpg-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-fg focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="mpg-password" className="mb-1 block text-xs font-medium text-muted">
                Mot de passe MPG
              </label>
              <input
                id="mpg-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-fg focus:outline-none"
              />
            </div>
            <button disabled={busy || !email || !password} className="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white disabled:opacity-40">
              {busy ? "Connexion…" : "Se connecter à MPG"}
            </button>
            <p className="text-[11px] leading-relaxed text-subtle">
              Ton mot de passe sert uniquement à ouvrir la session MPG et n&apos;est jamais enregistré. La session est gardée 7 jours dans un
              cookie sécurisé, illisible par la page. L&apos;API MPG n&apos;est pas officielle et peut changer.
            </p>
          </form>
        )}

        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-danger">{error}</p>}

        {connected && (
          <div className="space-y-2">
            {!leagues && <div className="h-24 animate-pulse rounded-xl bg-card" />}
            {leagues?.length === 0 && <p className="text-sm text-muted">Aucune ligue sur ce compte.</p>}
            {leagues?.map((l) => {
              const champ = getChampionshipById(l.championshipId);
              return (
                <div key={l.divisionId} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{l.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      {champ && <Flag code={champ.countryCode} size={14} />}
                      {champ?.name ?? `Championnat ${l.championshipId}`}
                    </p>
                  </div>
                  <button
                    onClick={() => importLeague(l)}
                    disabled={!l.teamId || !champ || importing === l.divisionId}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {importing === l.divisionId ? "Import…" : target ? "Utiliser" : "Importer"}
                  </button>
                </div>
              );
            })}
            <button onClick={signOut} className="text-xs text-muted underline">
              Se déconnecter de MPG
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportMpgPage() {
  return (
    <Suspense>
      <ImportMpg />
    </Suspense>
  );
}
