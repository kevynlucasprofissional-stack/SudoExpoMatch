// Cenário decorativo da página pública: rede de conexões, nós luminosos e clusters de pontos.
// SVG puro, sem imagens raster, sem animações complexas nesta rodada.

const NODES = [
  { x: 8, y: 46, r: 2.6, color: "#22d3ee" }, // ciano à esquerda
  { x: 82, y: 12, r: 2.2, color: "#8f9bff" }, // violeta superior direito
  { x: 52, y: 8, r: 1.8, color: "#a3e635" }, // verde centro superior
  { x: 14, y: 88, r: 2.4, color: "#a3e635" }, // verde inferior esquerdo
  { x: 90, y: 84, r: 2.2, color: "#ff8a3d" }, // laranja inferior direito
  { x: 66, y: 62, r: 1.6, color: "#3b82f6" }, // azul central
];

const LINKS: [number, number][] = [
  [0, 2],
  [0, 3],
  [2, 1],
  [1, 5],
  [5, 4],
  [3, 5],
  [0, 5],
  [2, 5],
];

function dotCluster(cx: number, cy: number, cols: number, rows: number, gap: number, key: string) {
  const dots = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      dots.push(
        <circle
          key={`${key}-${i}-${j}`}
          cx={cx + i * gap}
          cy={cy + j * gap}
          r={0.22}
          fill="#dbeafe"
          opacity={0.35 - (i + j) * 0.02}
        />,
      );
    }
  }
  return dots;
}

export function ConnectionScene({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
    >
      <defs>
        <linearGradient id="cs-link" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#8f9bff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a3e635" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="cs-halo">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* órbitas / curvas finas */}
      <g fill="none" stroke="url(#cs-link)" strokeWidth="0.12" opacity="0.75">
        <ellipse cx="30" cy="50" rx="46" ry="34" />
        <ellipse cx="66" cy="46" rx="38" ry="42" />
        <path d="M-5 70 C 25 40, 60 82, 108 34" />
        <path d="M-5 24 C 30 60, 70 12, 108 62" />
      </g>

      {/* linhas conectando regiões */}
      <g stroke="url(#cs-link)" strokeWidth="0.14" opacity="0.6">
        {LINKS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>

      {/* clusters de pontos */}
      <g>{dotCluster(76, 6, 9, 5, 2.2, "tr")}</g>
      <g>{dotCluster(4, 74, 7, 5, 2.2, "bl")}</g>
      <g>{dotCluster(40, 40, 8, 4, 3.2, "mid")}</g>

      {/* nós principais: halo + anel + concêntricos */}
      {NODES.map((n, i) => (
        <g key={i} style={{ color: n.color }}>
          <circle cx={n.x} cy={n.y} r={n.r * 4.5} fill="url(#cs-halo)" opacity="0.5" />
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r * 2.4}
            fill="none"
            stroke={n.color}
            strokeWidth="0.12"
            opacity="0.5"
          />
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r * 1.5}
            fill="none"
            stroke={n.color}
            strokeWidth="0.18"
            opacity="0.7"
          />
          <circle cx={n.x} cy={n.y} r={n.r * 0.5} fill={n.color} opacity="0.9" />
        </g>
      ))}
    </svg>
  );
}
