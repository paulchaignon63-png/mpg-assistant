/**
 * Chargement des championnats pour les scripts (entraînement, banc d'essai),
 * avec un cache disque d'une heure dans .cache/ pour ne pas retélécharger.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { championshipSlug, parseChampionship, type ChampionshipSnapshot } from "../lib/data/mpgstats";

const CACHE_DIR = path.join(process.cwd(), ".cache");

export async function loadForScript(championshipId: string): Promise<ChampionshipSnapshot> {
  const slug = championshipSlug(championshipId);
  const file = path.join(CACHE_DIR, `${slug}_v2.json`);
  const fresh = existsSync(file) && Date.now() - statSync(file).mtimeMs < 3600_000;
  let raw: unknown;
  if (fresh) {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } else {
    const res = await fetch(`https://backend.mpgstats.fr/leagues/${slug}_v2.json`);
    if (!res.ok) throw new Error(`MPGStats ${slug} : HTTP ${res.status}`);
    raw = await res.json();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(raw));
  }
  return parseChampionship(championshipId, raw as Parameters<typeof parseChampionship>[1]);
}

/** Championnats utilisés par défaut : L1, PL, Liga, Serie A, L2. */
export const DEFAULT_CHAMPIONSHIPS = ["1", "2", "3", "5", "4"];

export function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
