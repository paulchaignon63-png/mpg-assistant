/**
 * Ajustements statistiques simples, sans dépendance : régression linéaire
 * ridge (équations normales), logistique et Poisson (descente de gradient).
 */

/** Résout A x = b par élimination de Gauss avec pivot partiel. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Régression linéaire ridge. Renvoie [intercept, ...coefs]. L'intercept n'est pas pénalisé. */
export function ridge(X: number[][], y: number[], l2 = 1): number[] {
  const p = X[0]?.length ?? 0;
  const A = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
  const b = new Array(p + 1).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = [1, ...X[i]];
    for (let j = 0; j <= p; j++) {
      b[j] += row[j] * y[i];
      for (let k = 0; k <= p; k++) A[j][k] += row[j] * row[k];
    }
  }
  for (let j = 1; j <= p; j++) A[j][j] += l2;
  return solve(A, b);
}

/** Régression logistique (gradient + Newton léger). Renvoie [intercept, ...coefs]. */
export function logistic(X: number[][], y: number[], l2 = 1, iters = 60): number[] {
  const p = X[0]?.length ?? 0;
  let w = new Array(p + 1).fill(0);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
    const g = new Array(p + 1).fill(0);
    for (let i = 0; i < X.length; i++) {
      const row = [1, ...X[i]];
      let z = 0;
      for (let j = 0; j <= p; j++) z += w[j] * row[j];
      const mu = 1 / (1 + Math.exp(-z));
      const s = mu * (1 - mu);
      for (let j = 0; j <= p; j++) {
        g[j] += (mu - y[i]) * row[j];
        for (let k = 0; k <= p; k++) H[j][k] += s * row[j] * row[k];
      }
    }
    for (let j = 1; j <= p; j++) {
      g[j] += l2 * w[j];
      H[j][j] += l2;
    }
    const step = solve(H, g);
    w = w.map((v, j) => v - step[j]);
    if (step.reduce((a, s) => a + Math.abs(s), 0) < 1e-6) break;
  }
  return w;
}

/**
 * Régression de Poisson avec décalage : y ~ Poisson(offset × exp(X·w)),
 * sans intercept (l'offset porte le niveau). Renvoie les coefficients.
 */
export function poissonWithOffset(X: number[][], y: number[], offset: number[], l2 = 1, iters = 40): number[] {
  const p = X[0]?.length ?? 0;
  let w = new Array(p).fill(0);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    for (let i = 0; i < X.length; i++) {
      let z = 0;
      for (let j = 0; j < p; j++) z += w[j] * X[i][j];
      const mu = offset[i] * Math.exp(z);
      for (let j = 0; j < p; j++) {
        g[j] += (mu - y[i]) * X[i][j];
        for (let k = 0; k < p; k++) H[j][k] += mu * X[i][j] * X[i][k];
      }
    }
    for (let j = 0; j < p; j++) {
      g[j] += l2 * w[j];
      H[j][j] += l2;
    }
    const step = solve(H, g);
    w = w.map((v, j) => v - step[j]);
    if (step.reduce((a, s) => a + Math.abs(s), 0) < 1e-7) break;
  }
  return w;
}
