import { describe, expect, it } from "vitest";
import { simulateLineup, type Projection } from "./simulate";
import { optimizeLineup, pickCaptain, teamScore100 } from "./optimize";
import type { Pos } from "./mpg-rules";

let n = 0;
function p(position: Pos, noteMean: number, extra: Partial<Projection> = {}): Projection {
  n++;
  return {
    id: `p${n}`,
    name: `Joueur ${n}`,
    club: "Club",
    position,
    pStart: 0.95,
    pPlay: 1,
    noteMean,
    noteSd: 0.0001,
    goalRate: 0,
    ...extra,
  };
}

describe("simulateLineup", () => {
  it("fait entrer le remplaçant du même poste quand le titulaire ne joue pas", () => {
    const starters = [p("G", 5), p("D", 5), p("M", 5), p("A", 5, { pPlay: 0 })];
    const benchA = p("A", 7);
    const stats = simulateLineup(starters, [benchA], { sims: 200 });
    expect(stats.mean).toBeCloseTo(22, 0);
    expect(stats.benchUsage[benchA.id]).toBe(1);
    expect(stats.rotaldoRate).toBe(0);
  });

  it("applique −1 par ligne sautée", () => {
    const starters = [p("G", 5), p("A", 5, { pPlay: 0 })];
    const benchD = p("D", 6); // deux lignes d'écart → 6 − 2 = 4
    const stats = simulateLineup(starters, [benchD], { sims: 100 });
    expect(stats.mean).toBeCloseTo(9, 0);
  });

  it("aligne Rotaldo (2,5) quand personne ne peut entrer", () => {
    const starters = [p("G", 5, { pPlay: 0 }), p("D", 5)];
    const benchD = p("D", 7); // un défenseur ne remplace jamais le gardien
    const stats = simulateLineup(starters, [benchD], { sims: 100 });
    expect(stats.mean).toBeCloseTo(7.5, 1);
    expect(stats.rotaldoRate).toBe(1);
  });
});

describe("optimizeLineup", () => {
  function squad(): Projection[] {
    return [
      p("G", 6), p("G", 5),
      p("D", 5.5), p("D", 5.4), p("D", 5.3), p("D", 4.2), p("D", 4.1), p("D", 4.0),
      p("M", 6.5), p("M", 6.4), p("M", 6.3), p("M", 6.2), p("M", 6.1), p("M", 4.0),
      p("A", 6.8), p("A", 6.6), p("A", 6.4), p("A", 4.0),
    ];
  }

  it("choisit seul une formation qui aligne les meilleures lignes", () => {
    const plan = optimizeLineup(squad(), { formation: "auto", sims: 300 });
    // Défense faible au-delà de 3, milieu et attaque profonds → 3 défenseurs.
    expect(String(plan.formation)[0]).toBe("3");
    expect(plan.starters).toHaveLength(11);
    expect(plan.bench.filter((b) => b.position === "G")).toHaveLength(1);
    expect(plan.bench.length).toBeLessThanOrEqual(7);
    expect(plan.formations).toHaveLength(8);
  });

  it("respecte une formation imposée", () => {
    const plan = optimizeLineup(squad(), { formation: 541, sims: 200 });
    expect(plan.formation).toBe(541);
  });

  it("préfère en mode sûr le joueur qui joue sûrement", () => {
    const sure = p("A", 6.0, { pPlay: 1, pStart: 1 });
    const risky = p("A", 7.0, { pPlay: 0.55, pStart: 0.5, noteSd: 1.2 });
    const base = squad().filter((x) => x.position !== "A");
    const safe = optimizeLineup([...base, sure, risky, p("A", 3), p("A", 3)], { formation: 451, mode: "safe", sims: 300 });
    expect(safe.starters.find((x) => x.position === "A")?.id).toBe(sure.id);
  });
});

describe("pickCaptain", () => {
  it("écarte un joueur qui risque de ne pas jouer", () => {
    const star = p("A", 7.5, { pStart: 0.4, pPlay: 0.5 });
    const solid = p("M", 6.5, { pStart: 0.95 });
    expect(pickCaptain([star, solid], "balanced")).toBe(solid.id);
  });

  it("départage les ex æquo de façon stable", () => {
    const a = p("M", 6, { id: "b" });
    const b = p("M", 6, { id: "a" });
    expect(pickCaptain([a, b], "balanced")).toBe("a");
  });
});

describe("teamScore100", () => {
  it("borne la note entre 0 et 100", () => {
    expect(teamScore100(10)).toBe(0);
    expect(teamScore100(200)).toBe(100);
  });
});
