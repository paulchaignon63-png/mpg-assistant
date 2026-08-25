/** Diagnostic temporaire : structure du fichier MPGStats (club dispo ?). À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const res = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return NextResponse.json({ status: res.status });

  const data = (await res.json()) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  out.topKeys = Object.keys(data);

  // Localiser le tableau de joueurs (souvent data.p ou data.mL.p)
  const asArray = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);
  const players =
    asArray((data as { p?: unknown }).p) ??
    asArray(((data as { mL?: { p?: unknown } }).mL)?.p) ??
    null;

  out.playersFoundUnder = asArray((data as { p?: unknown }).p)
    ? "data.p"
    : asArray(((data as { mL?: { p?: unknown } }).mL)?.p)
      ? "data.mL.p"
      : "introuvable";

  if (players && players.length) {
    out.playerCount = players.length;
    const sample = players[0] as Record<string, unknown>;
    out.samplePlayerKeys = Object.keys(sample);
    out.samplePlayer = sample;
    // Chercher un champ ressemblant à un club/équipe sur les 5 premiers
    out.sampleFive = players.slice(0, 5).map((p) => {
      const o = p as Record<string, unknown>;
      return { n: o.n, f: o.f, fp: o.fp, c: o.c, keys: Object.keys(o) };
    });
  }

  // Y a-t-il une table de clubs quelque part ?
  for (const k of Object.keys(data)) {
    const v = (data as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sub = Object.keys(v as Record<string, unknown>);
      if (sub.some((s) => /club|team|equipe/i.test(s))) {
        out[`clubHintUnder_${k}`] = sub;
      }
    }
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
