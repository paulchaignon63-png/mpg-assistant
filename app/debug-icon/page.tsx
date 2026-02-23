"use client";

import { useEffect, useState } from "react";

type IconCheck = { url: string; status: number | string };

export default function DebugIconPage() {
  const [links, setLinks] = useState<{ rel: string; href: string }[]>([]);
  const [checks, setChecks] = useState<IconCheck[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async () => {
      const base = window.location.origin;
      const iconLinks = Array.from(
        document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')
      ).map((el) => ({
        rel: (el as HTMLLinkElement).rel,
        href: (el as HTMLLinkElement).href,
      }));
      setLinks(iconLinks);

      const urls = ["/icon.png", "/icon-192.png", "/icon-512.png", "/favicon.ico", "/apple-icon.png"];
      const results: IconCheck[] = [];
      for (const u of urls) {
        try {
          const r = await fetch(base + u, { method: "HEAD" });
          results.push({ url: u, status: r.status });
        } catch (e) {
          results.push({ url: u, status: String(e) });
        }
      }
      setChecks(results);
      setDone(true);
    };
    run();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A1F1C] p-6 text-[#F9FAFB] font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Diagnostic icônes</h1>
      <p className="mb-4 text-[#9CA3AF]">Origin: {typeof window !== "undefined" ? window.location.origin : "-"}</p>

      <h2 className="font-semibold mt-6 mb-2">Link tags dans le HTML</h2>
      <pre className="bg-[#0F2F2B] p-4 rounded overflow-x-auto">
        {links.length === 0 && !done ? "Chargement..." : JSON.stringify(links, null, 2)}
      </pre>

      <h2 className="font-semibold mt-6 mb-2">Disponibilité des fichiers</h2>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.url}>
            {c.url}: <span className={c.status === 200 ? "text-emerald-400" : "text-red-400"}>{String(c.status)}</span>
          </li>
        ))}
      </ul>
      {!done && checks.length === 0 && <p className="text-[#9CA3AF]">Chargement...</p>}
    </div>
  );
}
