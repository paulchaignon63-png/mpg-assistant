/**
 * Mini-courbe des dernières notes MPG (du plus ancien au plus récent).
 * Un match sans note (absent, pas entré) est marqué d'une croix en bas.
 */
export function Sparkline({ notes, width = 140, height = 40 }: { notes: number[]; width?: number; height?: number }) {
  const values = [...notes].reverse(); // reçu du plus récent au plus ancien
  if (values.length === 0) return <span className="text-xs text-subtle">Pas encore de match</span>;
  const min = 2;
  const max = 9;
  const pad = 6;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => pad + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (height - pad * 2);
  const pts = values.map((v, i) => ({ x: pad + i * step, v }));
  const played = pts.filter((p) => p.v > 0);
  const path = played.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const ref = y(5);
  return (
    <svg width={width} height={height} role="img" aria-label={`Dernières notes : ${values.map((v) => (v > 0 ? v : "absent")).join(", ")}`}>
      <line x1={pad} x2={width - pad} y1={ref} y2={ref} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />
      {played.length > 1 && <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />}
      {pts.map((p, i) =>
        p.v > 0 ? (
          <g key={i}>
            <circle cx={p.x} cy={y(p.v)} r={i === pts.length - 1 ? 3.5 : 2.5} fill="var(--accent)" />
            <text x={p.x} y={y(p.v) - 6} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.7">
              {p.v}
            </text>
          </g>
        ) : (
          <text key={i} x={p.x} y={height - 2} textAnchor="middle" fontSize="10" fill="var(--danger)">
            ×
          </text>
        )
      )}
    </svg>
  );
}
