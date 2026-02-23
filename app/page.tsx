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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1F1C] p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1F4641] bg-[#0F2F2B] p-8 shadow-xl">
        <div className="mb-4 flex justify-center">
          <img src="/logo.png" alt="Le 11 parfait" className="h-16 w-16" />
        </div>
        <h1 className="mb-2 text-center text-2xl font-bold text-[#F9FAFB] sm:text-3xl">
          Le 11 parfait
        </h1>
        <p className="mb-6 text-center text-[#9CA3AF]">
          Connecte-toi avec tes identifiants MPG
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-[#9CA3AF]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-[#1F4641] bg-[#0A1F1C] px-4 py-2.5 text-[#F9FAFB] placeholder-[#6B7280] focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              placeholder="ton@email.com"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-[#9CA3AF]"
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-[#1F4641] bg-[#0A1F1C] px-4 py-2.5 text-[#F9FAFB] placeholder-[#6B7280] focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-[#F9FAFB] transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-[#6B7280]">
          Tes identifiants ne sont jamais stockés. Connexion directe à ta
          plateforme.
        </p>
      </div>
    </div>
  );
}
