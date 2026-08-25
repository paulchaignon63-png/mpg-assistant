/** Diagnostic temporaire : table des clubs + blessures MPGStats. À SUPPRIMER. */
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export async function GET() {
  const res = await fetch("https://backend.mpgstats.fr/leagues/Ligue-1_v2.json", {
    headers: { "User-Agent": UA },
  });
  const data = (await res.json()) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // data.c = clubs ? Structure ?
  const c = (data as { c?: unknown }).c;
  out.c_isArray = Array.isArray(c);
  out.c_type = typeof c;
  if (Array.isArray(c)) {
    out.c_len = c.length;
    out.c_sample = c.slice(0, 4);
  } else if (c && typeof c === "object") {
    const keys = Object.keys(c as Record<string, unknown>);
    out.c_keys = keys.slice(0, 6);
    out.c_sample = keys.slice(0, 4).map((k) => ({ [k]: (c as Record<string, unknown>)[k] }));
  }

  // data.e ?
  const e = (data as { e?: unknown }).e;
  out.e_type = Array.isArray(e) ? `array(${e.length})` : typeof e;
  if (Array.isArray(e)) out.e_sample = e.slice(0, 2);

  // Ensemble des postes fp présents
  const players = (data as { p?: Array<{ fp?: string; c?: number }> }).p ?? [];
  out.fpValues = Array.from(new Set(players.map((p) => p.fp).filter(Boolean)));
  out.clubIdsCount = new Set(players.map((p) => p.c)).size;

  // Un joueur blessé (fo non vide) pour comprendre le format
  const injured = players.find((p) => Array.isArray((p as { fo?: unknown[] }).fo) && (p as { fo?: unknown[] }).fo!.length > 0);
  out.injuredSample = injured
    ? { n: (injured as { n?: string }).n, fo: (injured as { fo?: unknown }).fo }
    : "aucun";

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
