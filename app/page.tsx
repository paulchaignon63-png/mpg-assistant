"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/mpg/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur de connexion");
      localStorage.setItem("mpg_token", data.token);
      localStorage.setItem("mpg_userId", data.userId);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-950 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-emerald-800/50 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <h1 className="mb-2 text-center text-2xl font-bold text-emerald-400">
          Fantasy Assistant MPG
        </h1>
        <p className="mb-6 text-center text-sm text-slate-400">
          Connecte-toi avec tes identifiants MPG
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="ton@email.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          Tes identifiants ne sont jamais stockés. Connexion directe à MPG.
        </p>
      </div>
    </div>
  );
}
