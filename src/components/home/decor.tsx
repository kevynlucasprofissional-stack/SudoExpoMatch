// Elementos decorativos SVG puros — background, sem interação.
// Respeita prefers-reduced-motion via ausência de animação.

export function DotTexture({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="dot-pat" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.4" fill="var(--secondary)" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-pat)" />
    </svg>
  );
}

export function CornerLeaves({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={className} fill="none">
      <path
        d="M180 20 C 150 40 130 70 140 110 C 148 140 180 150 195 130"
        stroke="var(--secondary)"
        strokeWidth="14"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M170 60 C 140 80 130 110 150 140"
        stroke="var(--success)"
        strokeWidth="10"
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M195 90 C 175 110 165 135 175 165"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

export function CornerLines({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={className} fill="none">
      <path
        d="M-10 180 C 40 150 70 170 120 130"
        stroke="var(--accent)"
        strokeWidth="3"
        opacity="0.7"
      />
      <path
        d="M-10 200 C 50 175 90 190 140 160"
        stroke="var(--accent)"
        strokeWidth="2"
        opacity="0.5"
      />
      <path
        d="M-10 160 C 30 140 60 160 100 120"
        stroke="var(--warning)"
        strokeWidth="2"
        opacity="0.6"
      />
    </svg>
  );
}

// Pequenos fragmentos de papel branco espalhados discretamente no fundo escuro.
export function PaperFragments({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="#ffffff" opacity="0.05">
        <polygon points="120,220 220,200 240,280 140,300" />
        <polygon points="1420,120 1520,140 1500,210 1400,190" />
        <polygon points="80,720 200,700 210,780 90,790" />
        <polygon points="1360,760 1470,780 1450,850 1340,830" />
        <polygon points="760,940 860,930 870,990 770,995" />
      </g>
      <g fill="#ffffff" opacity="0.035">
        <polygon points="520,420 600,410 620,470 540,485" />
        <polygon points="1080,520 1170,510 1180,580 1090,590" />
      </g>
    </svg>
  );
}
