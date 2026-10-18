import { describe, expect, it } from "vitest";
import { logistic, poissonWithOffset, ridge } from "./fit";
import { makeRng } from "./simulate";

describe("ajustements", () => {
  it("retrouve une droite", () => {
    const X = Array.from({ length: 50 }, (_, i) => [i / 10]);
    const y = X.map(([x]) => 2 + 3 * x);
    const [b0, b1] = ridge(X, y, 0);
    expect(b0).toBeCloseTo(2, 5);
    expect(b1).toBeCloseTo(3, 5);
  });

  it("retrouve le sens d'une logistique", () => {
    const rng = makeRng(1);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const x = rng() * 4 - 2;
      X.push([x]);
      y.push(rng() < 1 / (1 + Math.exp(-(0.5 + 2 * x))) ? 1 : 0);
    }
    const [b0, b1] = logistic(X, y, 0.01);
    expect(b0).toBeCloseTo(0.5, 0);
    expect(b1).toBeGreaterThan(1.5);
    expect(b1).toBeLessThan(2.5);
  });

  it("retrouve un effet multiplicatif de Poisson", () => {
    const rng = makeRng(2);
    const X: number[][] = [];
    const y: number[] = [];
    const off: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const x = rng() - 0.5;
      const lambda = 0.5 * Math.exp(1.2 * x);
      let k = 0;
      let p = Math.exp(-lambda);
      let s = p;
      const u = rng();
      while (u > s && k < 20) {
        k++;
        p *= lambda / k;
        s += p;
      }
      X.push([x]);
      y.push(k);
      off.push(0.5);
    }
    const [w] = poissonWithOffset(X, y, off, 0.01);
    expect(w).toBeGreaterThan(0.9);
    expect(w).toBeLessThan(1.5);
  });
});
