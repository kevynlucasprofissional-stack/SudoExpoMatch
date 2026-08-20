// Grafismo de rede/conexão. SVG puro, respeita prefers-reduced-motion.
export function NetworkGraphic({ className = "" }: { className?: string }) {
  const nodes = [
    { x: 15, y: 25 },
    { x: 78, y: 18 },
    { x: 42, y: 60 },
    { x: 88, y: 70 },
    { x: 20, y: 80 },
    { x: 60, y: 32 },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="line" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--secondary)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {nodes.map((a, i) =>
        nodes
          .slice(i + 1)
          .map((b, j) => (
            <line
              key={`${i}-${j}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="url(#line)"
              strokeWidth={0.25}
              opacity={0.5}
            />
          )),
      )}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={1.8} fill="var(--warning)" opacity={0.9} />
          <circle
            cx={n.x}
            cy={n.y}
            r={3}
            fill="none"
            stroke="var(--warning)"
            strokeWidth={0.3}
            opacity={0.5}
            className="animate-pulse-ring"
            style={{ animationDelay: `${i * 0.3}s`, transformOrigin: `${n.x}px ${n.y}px` }}
          />
        </g>
      ))}
    </svg>
  );
}
