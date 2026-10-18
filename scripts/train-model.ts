/**
 * Apprend les coefficients du modèle sur l'historique MPGStats et les écrit
 * dans lib/engine/model/coefficients.json.
 *
 *   npm run train                      # L1, PL, Liga, Serie A, L2
 *   npm run train -- --champ 1         # un seul championnat
 *   npm run train -- --season previous # saison précédente seulement (test hors échantillon)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { backtestRounds, samplesForRound, type Sample } from "../lib/engine/dataset";
import { COEFFICIENTS } from "../lib/engine/model";
import { trainCoefficients } from "../lib/engine/train";
import { argValue, DEFAULT_CHAMPIONSHIPS, loadForScript } from "./_load";

async function main() {
  const champs = argValue("champ")?.split(",") ?? DEFAULT_CHAMPIONSHIPS;
  const onlyPrevious = argValue("season") === "previous";
  const out = argValue("out") ?? path.join("lib", "engine", "model", "coefficients.json");
  const samples: Sample[] = [];
  for (const id of champs) {
    const snap = await loadForScript(id);
    const rounds = backtestRounds(snap, 2).filter((r) => !onlyPrevious || r.seasonId !== snap.currentSeasonId);
    for (const { seasonId, round } of rounds) samples.push(...samplesForRound(snap, seasonId, round));
    console.log(`${snap.name} : ${rounds.length} journées, ${samples.length} échantillons cumulés`);
  }
  const coefs = trainCoefficients(samples, COEFFICIENTS);
  writeFileSync(out, JSON.stringify(coefs, null, 2) + "\n");
  console.log(`Coefficients écrits dans ${out}`);
  for (const pos of ["G", "D", "M", "A"] as const) {
    const m = coefs.note[pos];
    console.log(`  ${pos} : écart-type des résidus ${m.sd.toFixed(2)}, forme récente ${m.coef.recentNote.toFixed(2)}, saison ${m.coef.seasonNote.toFixed(2)}, adversaire ${m.coef.oppWeakness.toFixed(2)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
