// Cenário decorativo da página pública: rede de conexões, nós luminosos e clusters de pontos.
// SVG puro, sem imagens raster, sem animações complexas nesta rodada.

const NODES: { x: number; y: number; r: number; color: string; dur: number; ring?: boolean }[] = [
  { x: 8, y: 46, r: 2.6, color: "#22d3ee", dur: 5, ring: true }, // ciano à esquerda
  { x: 73, y: 15, r: 2.2, color: "#8f9bff", dur: 7 }, // violeta superior direito
  { x: 52, y: 8, r: 1.8, color: "#a3e635", dur: 6, ring: true }, // verde centro superior
  { x: 5, y: 74, r: 2.0, color: "#a3e635", dur: 4 }, // verde inferior esquerdo
  { x: 95, y: 70, r: 2.0, color: "#ff8a3d", dur: 6.5, ring: true }, // laranja inferior direito
  { x: 66, y: 62, r: 1.6, color: "#3b82f6", dur: 5.5 }, // azul central
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
        <path d="M-5 70 C 25 40, 60 82, 108 34" className="max-md:hidden" />
        <path d="M-5 24 C 30 60, 70 12, 108 62" className="max-md:hidden" />
      </g>

      {/* linhas conectando regiões */}
      <g stroke="url(#cs-link)" strokeWidth="0.14" opacity="0.6" className="pb-link">
        {LINKS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>

      {/* clusters de pontos */}
      <g className="pb-dots" style={{ ["--pb-dur" as string]: "7s" }}>
        {dotCluster(76, 6, 9, 5, 2.2, "tr")}
      </g>
      <g className="pb-dots max-md:hidden" style={{ ["--pb-dur" as string]: "9s", animationDelay: "1.5s" }}>
        {dotCluster(4, 74, 7, 5, 2.2, "bl")}
      </g>
      <g className="pb-dots max-md:hidden" style={{ ["--pb-dur" as string]: "11s", animationDelay: "3s" }}>
        {dotCluster(40, 40, 8, 4, 3.2, "mid")}
      </g>

      {/* nós principais: halo + anel + concêntricos */}
      {NODES.map((n, i) => (
        <g key={i} style={{ color: n.color }}>
          {n.ring ? (
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r * 3}
              fill="none"
              stroke={n.color}
              strokeWidth="0.14"
              className="pb-ring max-md:hidden"
              style={{ ["--pb-dur" as string]: `${n.dur + 1.5}s`, animationDelay: `${i * 0.8}s` }}
            />
          ) : null}
          <g
            className="pb-node"
            style={{ ["--pb-dur" as string]: `${n.dur}s`, animationDelay: `${i * 0.6}s` }}
          >
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
        </g>
      ))}
    </svg>
  );
}
