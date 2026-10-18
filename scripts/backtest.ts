/**
 * Banc d'essai : rejoue les journées passées et compare le nouveau moteur à
 * l'ancien et à un choix naïf. Écrit un résumé dans
 * lib/engine/model/backtest-summary.json (affiché sur la page Précision).
 *
 *   npm run backtest                         # L1, saisons précédente + en cours
 *   npm run backtest -- --champ 1,2 --squads 40
 *   npm run backtest -- --holdout            # apprend sur la saison précédente,
 *                                            # évalue sur la saison en cours
 */
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { backtestRounds, samplesForRound, type Sample } from "../lib/engine/dataset";
import { runBacktest, type BacktestSummary } from "../lib/engine/backtest";
import { COEFFICIENTS } from "../lib/engine/model";
import { trainCoefficients } from "../lib/engine/train";
import { argValue, loadForScript } from "./_load";

async function main() {
  const champs = argValue("champ")?.split(",") ?? ["1"];
  const squads = Number(argValue("squads") ?? 40);
  const holdout = process.argv.includes("--holdout");
  const summaries: BacktestSummary[] = [];

  for (const id of champs) {
    const snap = await loadForScript(id);
    let coefficients = COEFFICIENTS;
    let seasons: number[] | undefined;
    if (holdout) {
      const train: Sample[] = [];
      for (const { seasonId, round } of backtestRounds(snap, 2)) {
        if (seasonId !== snap.currentSeasonId) train.push(...samplesForRound(snap, seasonId, round));
      }
      coefficients = trainCoefficients(train, COEFFICIENTS);
      seasons = [snap.currentSeasonId];
      console.log(`${snap.name} : modèle appris sur ${train.length} échantillons de la saison précédente`);
    }
    const s = runBacktest(snap, {
      coefficients,
      squadsPerRound: squads,
      seasons,
      onRound: (r) =>
        console.log(
          `  saison ${r.seasonId} J${String(r.round).padStart(2)} : nouveau ${r.newPoints.toFixed(1)} · ancien ${r.oldPoints.toFixed(1)} · naïf ${r.naivePoints.toFixed(1)} · erreur note ${r.noteMae.toFixed(2)} (réf. ${r.baselineMae.toFixed(2)})`
        ),
    });
    summaries.push(s);
    console.log(`\n${snap.name} — ${s.rounds} journées × ${s.squadsPerRound} effectifs`);
    console.log(`  Points par journée : nouveau ${s.newPoints.toFixed(2)} · ancien ${s.oldPoints.toFixed(2)} · naïf ${s.naivePoints.toFixed(2)}`);
    console.log(`  Le nouveau bat l'ancien dans ${(s.newBeatsOld * 100).toFixed(0)} % des effectifs où ils diffèrent`);
    console.log(`  Erreur moyenne de note : ${s.noteMae.toFixed(3)} (moyenne de saison : ${s.baselineMae.toFixed(3)})`);
    console.log(`  Brier P(titulaire) : ${s.startBrier.toFixed(3)} (taux récent : ${s.baselineBrier.toFixed(3)})`);
  }

  const file = path.join("lib", "engine", "model", "backtest-summary.json");
  let previous: Record<string, unknown> = {};
  try {
    previous = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* premier passage */
  }
  for (const s of summaries) previous[s.championshipId] = { ...s, holdout };
  writeFileSync(file, JSON.stringify(previous, null, 2) + "\n");
  console.log(`\nRésumé écrit dans ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
