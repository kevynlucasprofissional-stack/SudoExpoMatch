import { useId } from "react";
import { Check, Plus, Users } from "lucide-react";

type HairStyle = "long" | "short" | "bob";

type ProfessionalBustProps = {
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
        d="M31 54 C31 29 43 18 60 18 C77 18 89 29 89 54 L89 112 C89 119 85 124 78 126 L76 126 L76 70 C76 52 70 42 60 42 C50 42 44 52 44 70 L44 126 L42 126 C35 124 31 119 31 112 Z"
        fill={color}
      />
    );
  }

  if (style === "bob") {
    return (
      <path
        d="M31 53 C31 29 43 18 60 18 C77 18 89 29 89 53 L89 91 C89 99 84 104 76 106 L73 106 L73 70 C73 53 68 43 60 43 C52 43 47 53 47 70 L47 106 L44 106 C36 104 31 99 31 91 Z"
        fill={color}
      />
    );
  }

  return (
    <path
      d="M35 50 C35 31 45 21 60 21 C75 21 85 31 85 50 C85 57 83 63 80 68 L40 68 C37 63 35 57 35 50 Z"
      fill={color}
    />
  );
}

function HairFront({ style, color }: { style: HairStyle; color: string }) {
  if (style === "long") {
    return (
      <>
        <path
          d="M35 51 C37 30 47 23 60 23 C73 23 83 30 85 51 C80 44 72 40 60 40 C48 40 40 44 35 51 Z"
          fill={color}
        />
        <path d="M35 51 C34 68 35 83 39 96 L44 94 L44 62 Z" fill={color} />
        <path d="M85 51 C86 68 85 83 81 96 L76 94 L76 62 Z" fill={color} />
      </>
    );
  }

  if (style === "bob") {
    return (
      <>
        <path
          d="M34 50 C36 29 47 22 60 22 C73 22 84 29 86 50 C80 43 72 40 60 40 C48 40 40 43 34 50 Z"
          fill={color}
        />
        <path d="M34 50 C33 65 34 77 38 87 L45 84 L45 60 Z" fill={color} />
        <path d="M86 50 C87 65 86 77 82 87 L75 84 L75 60 Z" fill={color} />
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

function ProfessionalBust({
  x,
  y,
  scale,
  hairStyle,
  hairColor,
  skinColor,
  shirtColor,
  tieColor,
  label,
}: ProfessionalBustProps) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      data-professional={label}
      aria-hidden="true"
    >
      <g data-layer="hair-back">
        <HairBack style={hairStyle} color={hairColor} />
      </g>

      <path d="M52 80 L52 101 Q60 108 68 101 L68 80 Z" fill={skinColor} />
      <path d="M53 82 Q60 87 67 82 L67 88 Q60 93 53 88 Z" fill="rgba(11,18,82,0.08)" />

      <path
        d="M18 174 C18 132 35 105 60 105 C85 105 102 132 102 174 Z"
        fill={shirtColor}
      />

      <g data-layer="face">
        <ellipse cx="36" cy="58" rx="3.3" ry="5.4" fill={skinColor} />
        <ellipse cx="84" cy="58" rx="3.3" ry="5.4" fill={skinColor} />
        <ellipse cx="60" cy="57" rx="25" ry="29" fill={skinColor} />
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
    <div className="pointer-events-auto rounded-2xl border border-black/5 bg-white p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <Avatar tone={avatarTone} initials={initials} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-tight text-[#0b1252]">{title}</div>
          <span className={`mt-0.5 inline-block rounded px-1.5 text-[10px] font-bold ${badgeClassName}`}>
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
  const backgroundId = `hv-fair-bg-${uid}`;
  const boothBlueId = `hero-booth-blue-${uid}`;
  const boothCyanId = `hero-booth-cyan-${uid}`;
  const blurId = `hero-booth-blur-${uid}`;

  return (
    <div
      className="relative isolate mx-auto w-full max-w-[640px] overflow-visible pb-[132px]"
      data-testid="hero-visual-desktop-root"
    >
      <div
        aria-hidden
        className="absolute inset-x-2 top-2 h-[310px] bg-white/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)]"
        style={{
          clipPath:
            "polygon(3% 5%, 97% 2%, 100% 20%, 98% 57%, 100% 88%, 88% 100%, 58% 96%, 30% 100%, 8% 97%, 0% 74%, 2% 40%, 0 15%)",
        }}
      />

      <svg
        viewBox="0 0 620 330"
        className="relative z-[1] block w-full"
        aria-label="Três profissionais alinhados em uma feira, conectados por oportunidades de negócio"
        role="img"
      >
        <defs>
          <linearGradient id={backgroundId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#dbeafe" />
            <stop offset="1" stopColor="#8ec5f4" />
          </linearGradient>
          <linearGradient id={boothBlueId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1b26ae" stopOpacity="0.3" />
            <stop offset="1" stopColor="#1b26ae" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id={boothCyanId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#129cdf" stopOpacity="0.3" />
            <stop offset="1" stopColor="#129cdf" stopOpacity="0.06" />
          </linearGradient>
          <filter id={blurId} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect x="10" y="32" width="600" height="238" rx="16" fill={`url(#${backgroundId})`} />

        <g filter={`url(#${blurId})`} opacity="0.9" aria-hidden="true">
          <rect x="28" y="72" width="103" height="156" rx="7" fill={`url(#${boothBlueId})`} />
          <rect x="141" y="61" width="121" height="167" rx="7" fill={`url(#${boothCyanId})`} />
          <rect x="272" y="73" width="96" height="155" rx="7" fill={`url(#${boothBlueId})`} />
          <rect x="378" y="59" width="132" height="169" rx="7" fill={`url(#${boothCyanId})`} />
          <rect x="520" y="75" width="88" height="153" rx="7" fill={`url(#${boothBlueId})`} />
          <rect x="41" y="84" width="77" height="10" rx="2" fill="#1b26ae" opacity="0.5" />
          <rect x="154" y="74" width="94" height="10" rx="2" fill="#129cdf" opacity="0.52" />
          <rect x="392" y="72" width="104" height="10" rx="2" fill="#129cdf" opacity="0.52" />
        </g>

        <path
          d="M147 101 C 246 69, 374 69, 473 101"
          fill="none"
          stroke="var(--warning)"
          strokeDasharray="3 6"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <circle cx="147" cy="101" r="3.2" fill="var(--warning)" />
        <circle cx="310" cy="74" r="3.2" fill="var(--warning)" />
        <circle cx="473" cy="101" r="3.2" fill="var(--warning)" />

        <ProfessionalBust
          x={87}
          y={72}
          scale={0.92}
          hairStyle="long"
          hairColor="#3b2a1a"
          skinColor="#f2c9a3"
          shirtColor="#1b26ae"
          label="profissional-esquerda"
        />
        <ProfessionalBust
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
        <ProfessionalBust
          x={413}
          y={72}
          scale={0.92}
          hairStyle="bob"
          hairColor="#5a2f10"
          skinColor="#eab68a"
          shirtColor="#129cdf"
          label="profissional-direita"
        />

        <path
          d="M189 268 C 245 303, 375 303, 431 268"
          fill="none"
          stroke="var(--success)"
          strokeDasharray="3 6"
          strokeLinecap="round"
          strokeWidth="1.6"
          opacity="0.9"
        />
        <circle cx="189" cy="268" r="3.2" fill="var(--success)" />
        <circle cx="431" cy="268" r="3.2" fill="var(--success)" />
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
            gridTemplateColumns:
              "minmax(0,1fr) minmax(140px, 170px) minmax(0,1fr)",
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
