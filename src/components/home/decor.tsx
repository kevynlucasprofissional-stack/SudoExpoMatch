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
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className={className}
      fill="none"
    >
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
      <path d="M-10 180 C 40 150 70 170 120 130" stroke="var(--accent)" strokeWidth="3" opacity="0.7" />
      <path d="M-10 200 C 50 175 90 190 140 160" stroke="var(--accent)" strokeWidth="2" opacity="0.5" />
      <path d="M-10 160 C 30 140 60 160 100 120" stroke="var(--warning)" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}
