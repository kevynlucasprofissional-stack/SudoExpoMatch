import { useId } from "react";
import { Check, Plus, Users } from "lucide-react";

type HairStyle = "long" | "short" | "bob";

type ProfessionalProps = {
  x: number;
  y: number;
  scale: number;
  hairStyle: HairStyle;
  hairColor: string;
  skinColor: string;
  shirtColor: string;
  tieColor?: string;
  label: string;
};

function Avatar({ tone, initials }: { tone: string; initials: string }) {
  return (
    <div
      aria-hidden
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-white shadow-sm"
      style={{ background: tone }}
    >
      {initials}
    </div>
  );
}

function ChipVertical({
  label,
  color,
  textColor = "#0b1252",
}: {
  label: string;
  color: string;
  textColor?: string;
}) {
  return (
    <div
      className="flex min-h-7 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-semibold shadow-[0_4px_10px_-6px_rgba(0,0,0,0.35)]"
      style={{ background: color, color: textColor }}
    >
      {label}
    </div>
  );
}

function HairBack({ style, color }: { style: HairStyle; color: string }) {
  if (style === "long") {
    return (
      <path
        d="M34 52 C34 28 45 18 60 18 C75 18 86 28 86 52 L86 106 C86 114 82 119 75 121 L72 121 L72 63 C72 50 68 42 60 42 C52 42 48 50 48 63 L48 121 L45 121 C38 119 34 114 34 106 Z"
        fill={color}
      />
    );
  }

  if (style === "bob") {
    return (
      <path
        d="M33 52 C33 29 44 19 60 19 C76 19 87 29 87 52 L87 88 C87 97 82 102 74 104 L71 104 L71 64 C71 51 67 43 60 43 C53 43 49 51 49 64 L49 104 L46 104 C38 102 33 97 33 88 Z"
        fill={color}
      />
    );
  }

  return (
    <path
      d="M36 50 C36 31 45 22 60 22 C75 22 84 31 84 50 C84 57 82 62 79 67 L41 67 C38 62 36 57 36 50 Z"
      fill={color}
    />
  );
}

function HairFront({ style, color }: { style: HairStyle; color: string }) {
  if (style === "long") {
    return (
      <>
        <path
          d="M35 50 C38 30 47 23 60 23 C73 23 82 30 85 50 C79 43 71 40 60 40 C49 40 41 43 35 50 Z"
          fill={color}
        />
        <path d="M35 49 C34 56 35 63 38 69 L43 67 L43 54 Z" fill={color} />
        <path d="M85 49 C86 56 85 63 82 69 L77 67 L77 54 Z" fill={color} />
      </>
    );
  }

  if (style === "bob") {
    return (
      <>
        <path
          d="M34 50 C37 30 47 23 60 23 C73 23 83 30 86 50 C80 43 72 40 60 40 C48 40 40 43 34 50 Z"
          fill={color}
        />
        <path d="M34 49 C33 57 34 64 38 70 L44 67 L44 54 Z" fill={color} />
        <path d="M86 49 C87 57 86 64 82 70 L76 67 L76 54 Z" fill={color} />
      </>
    );
  }

  return (
    <path
      d="M35 50 C38 31 47 24 60 24 C73 24 82 31 85 50 C79 44 72 41 64 42 C57 39 48 42 41 46 C39 47 37 48 35 50 Z"
      fill={color}
    />
  );
}

function Professional({
  x,
  y,
  scale,
  hairStyle,
  hairColor,
  skinColor,
  shirtColor,
  tieColor,
  label,
}: ProfessionalProps) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      data-professional={label}
      aria-hidden="true"
    >
      <g data-layer="hair-back">
        <HairBack style={hairStyle} color={hairColor} />
      </g>

      <g data-layer="neck">
        <path d="M52 80 L52 101 Q60 107 68 101 L68 80 Z" fill={skinColor} />
        <path d="M53 82 Q60 87 67 82 L67 88 Q60 93 53 88 Z" fill="rgba(11,18,82,0.08)" />
      </g>

      <g data-layer="torso">
        <path d="M19 174 C19 132 36 106 60 106 C84 106 101 132 101 174 Z" fill={shirtColor} />
      </g>

      <g data-layer="face">
        <ellipse cx="36" cy="58" rx="3.1" ry="5" fill={skinColor} />
        <ellipse cx="84" cy="58" rx="3.1" ry="5" fill={skinColor} />
        <ellipse cx="60" cy="57" rx="24" ry="28" fill={skinColor} />
      </g>

      <g data-layer="hair-front">
        <HairFront style={hairStyle} color={hairColor} />
      </g>

      <g data-layer="features">
        <path
          d="M47 51 Q51 49 55 51"
          fill="none"
          stroke="#0b1252"
          strokeLinecap="round"
          strokeWidth="1.2"
          opacity="0.72"
        />
        <path
          d="M65 51 Q69 49 73 51"
          fill="none"
          stroke="#0b1252"
          strokeLinecap="round"
          strokeWidth="1.2"
          opacity="0.72"
        />
        <circle cx="51" cy="58" r="1.7" fill="#0b1252" />
        <circle cx="69" cy="58" r="1.7" fill="#0b1252" />
        <circle cx="46" cy="67" r="3" fill="#ff8d76" opacity="0.12" />
        <circle cx="74" cy="67" r="3" fill="#ff8d76" opacity="0.12" />
        <path
          d="M60 62 Q61 65 60 67"
          fill="none"
          stroke="#0b1252"
          strokeLinecap="round"
          strokeWidth="0.8"
          opacity="0.32"
        />
        <path
          d="M53 71 Q60 76 67 71"
          fill="none"
          stroke="#0b1252"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
      </g>

      <g data-layer="wear-front">
        <path d="M39 109 L60 122 L50 132 L34 115 Z" fill="#ffffff" opacity="0.96" />
        <path d="M81 109 L60 122 L70 132 L86 115 Z" fill="#ffffff" opacity="0.96" />

        {tieColor ? (
          <>
            <path d="M56 117 L64 117 L62 124 L58 124 Z" fill={tieColor} />
            <path d="M58 124 L62 124 L63 143 L60 147 L57 143 Z" fill={tieColor} />
          </>
        ) : null}

        <path
          d="M47 100 C50 116 54 128 60 138 C66 128 70 116 73 100"
          fill="none"
          stroke="#f1ff0a"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
        <rect x="53" y="137" width="14" height="17" rx="2" fill="#ffffff" />
        <rect x="56" y="141" width="8" height="1.7" rx="0.8" fill="#0b1252" />
        <rect x="56" y="145" width="7" height="1.2" rx="0.6" fill="#0b1252" opacity="0.55" />
        <rect x="56" y="148" width="7" height="1.2" rx="0.6" fill="#0b1252" opacity="0.4" />
      </g>
    </g>
  );
}

function ProfileCard({
  avatarTone,
  initials,
  title,
  badge,
  badgeClassName,
  description,
  category,
}: {
  avatarTone: string;
  initials: string;
  title: string;
  badge: string;
  badgeClassName: string;
  description: string;
  category: string;
}) {
  return (
    <div className="pointer-events-auto rounded-2xl border border-white/70 bg-white p-3 shadow-[0_18px_45px_-22px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2">
        <Avatar tone={avatarTone} initials={initials} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-tight text-[#0b1252]">{title}</div>
          <span
            className={`mt-0.5 inline-block rounded px-1.5 text-[10px] font-bold ${badgeClassName}`}
          >
            {badge}
          </span>
        </div>
      </div>
      <p className="mt-2 min-h-8 text-xs leading-4 text-slate-600">{description}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded-md bg-[#129cdf]/15 px-2 py-0.5 text-[10px] font-bold text-[#0b1252]">
          {category}
        </span>
        <span
          aria-hidden
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0b1252] text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

export function HeroVisual() {
  const uid = useId().replace(/:/g, "");
  const connectionGlowId = `hv-fair-bg-${uid}`;
  const lineGradientId = `hero-connection-line-${uid}`;

  return (
    <div
      className="relative isolate mx-auto w-full max-w-[640px] overflow-visible pb-[132px]"
      data-testid="hero-visual-desktop-root"
    >
      <svg
        viewBox="0 0 620 330"
        className="relative z-[1] block w-full overflow-visible"
        aria-label="Três profissionais conectados por uma rede de oportunidades de negócio"
        role="img"
      >
        <defs>
          <radialGradient id={connectionGlowId} cx="50%" cy="48%" r="58%">
            <stop offset="0" stopColor="#129cdf" stopOpacity="0.26" />
            <stop offset="0.48" stopColor="#1b26ae" stopOpacity="0.12" />
            <stop offset="1" stopColor="#1b26ae" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={lineGradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8bec01" />
            <stop offset="0.5" stopColor="#f1ff0a" />
            <stop offset="1" stopColor="#ff7d3b" />
          </linearGradient>
        </defs>

        <circle cx="310" cy="156" r="154" fill={`url(#${connectionGlowId})`} />
        <circle
          cx="310"
          cy="156"
          r="119"
          fill="none"
          stroke="#ffffff"
          strokeDasharray="2 10"
          strokeLinecap="round"
          strokeWidth="1.4"
          opacity="0.2"
        />
        <circle
          cx="310"
          cy="156"
          r="82"
          fill="none"
          stroke="#129cdf"
          strokeDasharray="5 9"
          strokeLinecap="round"
          strokeWidth="1.2"
          opacity="0.32"
        />

        <path
          d="M145 132 C205 69 259 72 310 104 C361 72 415 69 475 132"
          fill="none"
          stroke={`url(#${lineGradientId})`}
          strokeDasharray="4 7"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          d="M154 212 C222 259 398 259 466 212"
          fill="none"
          stroke="#8bec01"
          strokeDasharray="3 7"
          strokeLinecap="round"
          strokeWidth="1.7"
          opacity="0.85"
        />
        <path
          d="M310 104 C310 141 310 176 310 223"
          fill="none"
          stroke="#ffffff"
          strokeDasharray="2 8"
          strokeLinecap="round"
          strokeWidth="1.2"
          opacity="0.28"
        />

        <g aria-hidden="true">
          <circle cx="145" cy="132" r="5" fill="#8bec01" />
          <circle cx="310" cy="104" r="6" fill="#f1ff0a" />
          <circle cx="475" cy="132" r="5" fill="#ff7d3b" />
          <circle cx="154" cy="212" r="4" fill="#8bec01" />
          <circle cx="466" cy="212" r="4" fill="#8bec01" />
          <circle cx="310" cy="223" r="4" fill="#129cdf" />

          <circle cx="94" cy="157" r="3" fill="#ffffff" opacity="0.7" />
          <circle cx="526" cy="157" r="3" fill="#ffffff" opacity="0.7" />
          <circle cx="214" cy="54" r="3" fill="#129cdf" opacity="0.8" />
          <circle cx="406" cy="54" r="3" fill="#ff7d3b" opacity="0.8" />
        </g>

        <g opacity="0.2" aria-hidden="true">
          <circle cx="145" cy="160" r="76" fill="#ffffff" />
          <circle cx="310" cy="145" r="86" fill="#ffffff" />
          <circle cx="475" cy="160" r="76" fill="#ffffff" />
        </g>

        <Professional
          x={86}
          y={76}
          scale={0.98}
          hairStyle="long"
          hairColor="#3b2a1a"
          skinColor="#f2c9a3"
          shirtColor="#1b26ae"
          label="profissional-esquerda"
        />
        <Professional
          x={250}
          y={55}
          scale={1}
          hairStyle="short"
          hairColor="#1f1a12"
          skinColor="#c88a5a"
          shirtColor="#0b1252"
          tieColor="#ff7d3b"
          label="profissional-central"
        />
        <Professional
          x={414}
          y={76}
          scale={0.98}
          hairStyle="bob"
          hairColor="#5a2f10"
          skinColor="#eab68a"
          shirtColor="#129cdf"
          label="profissional-direita"
        />
      </svg>

      <div
        className="pointer-events-none absolute right-[-8px] top-[88px] z-[4] hidden w-[108px] flex-col gap-1.5 2xl:flex"
        data-testid="hero-visual-chips"
      >
        <ChipVertical label="Clientes" color="var(--success)" />
        <ChipVertical label="Fornecedores" color="var(--secondary)" />
        <ChipVertical label="Parceiros" color="var(--accent)" />
        <ChipVertical label="Distribuidores" color="#6b57e0" textColor="#ffffff" />
        <ChipVertical label="Serviços" color="#129cdf" />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] hidden md:block"
        data-testid="hero-visual-cards"
      >
        <div
          className="mx-auto grid max-w-[594px] items-end gap-3 px-2"
          style={{
            gridTemplateColumns: "minmax(0,1fr) minmax(140px, 170px) minmax(0,1fr)",
          }}
        >
          <ProfileCard
            avatarTone="linear-gradient(135deg,#129cdf,#1b26ae)"
            initials="TS"
            title="TechSolutions"
            badge="OFERECE"
            badgeClassName="bg-success/25 text-[#215800]"
            description="Automação e integração de sistemas"
            category="SERVIÇOS"
          />

          <div className="flex justify-center pb-2" aria-hidden>
            <div
              className="w-full rounded-2xl border border-success/50 bg-white px-3 py-3 text-center shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)]"
              data-testid="hero-visual-match-badge"
            >
              <div className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-success text-[#0b1252]">
                <Check className="h-4 w-4" />
              </div>
              <div className="mt-1 font-display text-[12px] font-bold leading-tight text-[#0b1252]">
                Match encontrado!
              </div>
              <div className="mt-1 text-[10px] font-medium text-slate-600">Interesse mútuo</div>
            </div>
          </div>

          <ProfileCard
            avatarTone="linear-gradient(135deg,#ff7d3b,#f04)"
            initials="IA"
            title="Indústria Alfa"
            badge="PROCURA"
            badgeClassName="bg-accent/25 text-[#5c2b00]"
            description="Fornecedores de tecnologia e parceiros"
            category="FORNECEDORES"
          />
        </div>
      </div>

      <div
        aria-hidden
        className="absolute left-3 top-1 z-[2] rounded-full bg-white/90 p-1.5 shadow"
      >
        <Users className="h-4 w-4 text-primary" />
      </div>
    </div>
  );
}
