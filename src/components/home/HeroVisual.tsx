import { useId } from "react";
import { Plus, Check, Users } from "lucide-react";

// Ilustração editorial desktop — bustos/meio-corpo de 3 profissionais
// conversando, fundo de feira sutil, cards integrados e selo central
// generoso. Composição editorial madura, sem áreas mortas.

function Avatar({ tone, initials }: { tone: string; initials: string }) {
  return (
    <div
      className="inline-flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-bold text-white shadow-sm"
      style={{ background: tone }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function ChipVertical({ label, color, text }: { label: string; color: string; text?: string }) {
  return (
    <div
      className="flex min-h-7 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-semibold shadow-[0_4px_10px_-6px_rgba(0,0,0,0.35)]"
      style={{ background: color, color: text ?? "#0b1252" }}
    >
      {label}
    </div>
  );
}

/**
 * Person — busto editorial. Camadas ordenadas:
 *  hair-back → neck → torso → face → hair-front → features → wear-front
 *
 * Todo o corpo é centralizado em x=60. viewBox local implícito: 120×180.
 * O torso termina em y≈180 (recorte inferior faz o efeito de busto).
 */
function Person({
  x,
  y = 0,
  scale = 1,
  rotate = 0,
  hair,
  skin,
  shirt,
  tie,
  hairStyle = "short",
  pose = "center",
}: {
  x: number;
  y?: number;
  scale?: number;
  rotate?: number;
  hair: string;
  skin: string;
  shirt: string;
  tie?: string;
  hairStyle?: "short" | "long" | "bob";
  pose?: "left" | "center" | "right";
}) {
  const faceShade = "rgba(0,0,0,0.06)";
  const eyeY = 58;

  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale}) rotate(${rotate} 60 90)`}
      data-person-pose={pose}
    >
      {/* 1. hair-back — massa traseira, coroa curva sem faixa reta */}
      <g data-layer="hair-back">
        {hairStyle === "long" && (
          <path
            d="M32 52 C 30 22, 90 22, 88 52 C 92 78, 92 108, 86 128 L 76 128 C 76 100, 74 82, 60 82 C 46 82, 44 100, 44 128 L 34 128 C 28 108, 28 78, 32 52 Z"
            fill={hair}
          />
        )}
        {hairStyle === "bob" && (
          <path
            d="M32 50 C 30 22, 90 22, 88 50 C 90 68, 88 84, 84 92 L 74 92 C 74 82, 70 76, 60 76 C 50 76, 46 82, 46 92 L 36 92 C 32 84, 30 68, 32 50 Z"
            fill={hair}
          />
        )}
        {hairStyle === "short" && (
          <path
            d="M36 52 C 34 26, 86 26, 84 52 C 84 62, 82 68, 80 70 L 40 70 C 38 68, 36 62, 36 52 Z"
            fill={hair}
            opacity="0.95"
          />
        )}
      </g>

      {/* 2. neck — atrás do tronco/gola */}
      <g data-layer="neck">
        <path d="M54 78 L 54 92 Q 60 96 66 92 L 66 78 Z" fill={skin} />
        <path d="M54 78 Q 60 82 66 78 L 66 82 Q 60 86 54 82 Z" fill="rgba(0,0,0,0.08)" />
      </g>

      {/* 3. torso — ombros naturais, mais estreitos */}
      <g data-layer="torso">
        <path
          d="M22 180 C 22 132, 40 108, 60 108 C 80 108, 98 132, 98 180 Z"
          fill={shirt}
        />
      </g>

      {/* 4. face — cabeça ligeiramente maior */}
      <g data-layer="face">
        <ellipse cx="37" cy="58" rx="3" ry="5" fill={skin} />
        <ellipse cx="83" cy="58" rx="3" ry="5" fill={skin} />
        <ellipse cx="60" cy="56" rx="26" ry="30" fill={skin} />
        <ellipse cx="60" cy="70" rx="18" ry="6" fill={faceShade} />
      </g>

      {/* 5. hair-front — coroa curva/mechas, cobrindo topo sem invadir olhos (y=58) */}
      <g data-layer="hair-front">
        {hairStyle === "short" && (
          <path
            d="M34 52 C 40 30, 80 30, 86 52 C 82 44, 74 42, 66 44 C 60 42, 54 44, 46 46 C 42 46, 38 48, 34 52 Z"
            fill={hair}
          />
        )}
        {hairStyle === "long" && (
          <>
            {/* coroa suave */}
            <path
              d="M32 52 C 34 26, 86 26, 88 52 C 84 44, 76 42, 66 44 C 60 44, 54 46, 48 48 C 42 46, 36 48, 32 52 Z"
              fill={hair}
            />
            {/* mechas laterais frontais */}
            <path d="M34 54 C 30 78, 30 96, 34 108 L 40 106 C 38 92, 38 76, 40 62 Z" fill={hair} />
            <path d="M86 54 C 90 78, 90 96, 86 108 L 80 106 C 82 92, 82 76, 80 62 Z" fill={hair} />
          </>
        )}
        {hairStyle === "bob" && (
          <path
            d="M32 50 C 34 24, 86 24, 88 50 C 84 42, 74 42, 66 46 C 60 44, 54 46, 48 48 C 42 44, 36 46, 32 50 Z"
            fill={hair}
          />
        )}
      </g>

      {/* 6. features — olhos, sobrancelhas, sorriso */}
      <g data-layer="features">
        <path
          d="M48 52 Q 52 50 56 52"
          stroke="#0b1252"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M64 52 Q 68 50 72 52"
          stroke="#0b1252"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        <circle cx="52" cy={eyeY} r="1.8" fill="#0b1252" />
        <circle cx="68" cy={eyeY} r="1.8" fill="#0b1252" />
        {/* nariz sutil */}
        <path
          d="M60 63 Q 61 66 60 68"
          stroke="#0b1252"
          strokeWidth="0.9"
          fill="none"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M53 72 Q 60 77 67 72"
          stroke="#0b1252"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* 7. wear-front — gola discreta, cordão curvo, crachá pequeno */}
      <g data-layer="wear-front">
        {/* gola em V mais discreta */}
        <path d="M60 108 L 50 132 L 60 138 L 70 132 Z" fill="#ffffff" opacity="0.9" />
        {/* gravata (só quando definida), estreita, curta */}
        {tie && <rect x="57" y="120" width="6" height="14" fill={tie} rx="1" />}
        {/* cordão nasce atrás do pescoço e forma curva natural */}
        <path
          d="M48 100 C 52 118 68 118 72 100"
          stroke="#f1ff0a"
          strokeWidth="1.6"
          fill="none"
        />
        {/* crachá pequeno, centralizado */}
        <rect x="54" y="140" width="12" height="14" rx="1.5" fill="#ffffff" />
        <rect x="56.5" y="143" width="7" height="1.6" fill="#0b1252" />
        <rect x="56.5" y="146" width="6" height="1.2" fill="#0b1252" opacity="0.6" />
        <rect x="56.5" y="148.5" width="6.5" height="1.2" fill="#0b1252" opacity="0.5" />
      </g>
    </g>
  );
}

export function HeroVisual() {
  const uid = useId().replace(/:/g, "");
  const idBg = `hv-fair-bg-${uid}`;
  const idBoothA = `hv-booth-a-${uid}`;
  const idBoothB = `hv-booth-b-${uid}`;
  const idSoft = `hv-soft-${uid}`;
  const idClip = `hv-clip-${uid}`;

  return (
    <div
      className="relative isolate mx-auto w-full max-w-[620px]"
      data-testid="hero-visual-desktop-root"
      style={{ paddingBottom: "clamp(48px, 5vw, 72px)" }}
    >
      {/* Recorte de papel — envolve a cena, sem grande área morta abaixo */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-2 mx-auto h-[300px] w-[96%] bg-white/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)]"
        style={{
          clipPath:
            "polygon(3% 6%, 97% 2%, 100% 24%, 98% 60%, 100% 88%, 88% 100%, 58% 96%, 30% 100%, 8% 97%, 0% 74%, 2% 40%, 0 16%)",
        }}
      />

      {/* Cena SVG — viewBox mais compacto */}
      <svg
        viewBox="0 0 620 320"
        className="relative z-[1] w-full"
        aria-label="Três profissionais conversando numa feira, com estandes desfocados ao fundo"
        role="img"
      >
        <defs>
          <linearGradient id={idBg} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#dbeafe" />
            <stop offset="1" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id={idBoothA} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1b26ae" stopOpacity="0.32" />
            <stop offset="1" stopColor="#1b26ae" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id={idBoothB} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#129cdf" stopOpacity="0.32" />
            <stop offset="1" stopColor="#129cdf" stopOpacity="0.08" />
          </linearGradient>
          <filter id={idSoft} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          {/* clip para recortar os torsos (efeito busto) */}
          <clipPath id={idClip}>
            <rect x="0" y="0" width="620" height="300" />
          </clipPath>
        </defs>

        {/* Faixa de fundo (feira) — ocupa toda a largura */}
        <g aria-hidden="true">
          <rect x="10" y="30" width="600" height="230" rx="14" fill={`url(#${idBg})`} />
          <g filter={`url(#${idSoft})`} opacity="0.9">
            <rect x="30" y="70" width="100" height="150" fill={`url(#${idBoothA})`} rx="6" />
            <rect x="140" y="60" width="120" height="160" fill={`url(#${idBoothB})`} rx="6" />
            <rect x="270" y="72" width="100" height="148" fill={`url(#${idBoothA})`} rx="6" />
            <rect x="380" y="58" width="130" height="162" fill={`url(#${idBoothB})`} rx="6" />
            <rect x="520" y="74" width="90" height="146" fill={`url(#${idBoothA})`} rx="6" />
            <rect x="40" y="82" width="80" height="10" fill="#1b26ae" opacity="0.5" rx="2" />
            <rect x="150" y="72" width="100" height="10" fill="#129cdf" opacity="0.55" rx="2" />
            <rect x="390" y="70" width="110" height="10" fill="#129cdf" opacity="0.55" rx="2" />
          </g>
        </g>

        {/* Linha superior sutil ligando os 3 personagens */}
        <g fill="none" strokeWidth="1.6" opacity="0.75" aria-hidden="true">
          <path
            d="M150 90 C 260 62, 360 62, 470 90"
            stroke="var(--warning)"
            strokeDasharray="3 6"
          />
        </g>
        <g aria-hidden="true">
          <circle cx="150" cy="90" r="3.2" fill="var(--warning)" />
          <circle cx="310" cy="66" r="3.2" fill="var(--warning)" />
          <circle cx="470" cy="90" r="3.2" fill="var(--warning)" />
        </g>

        {/* Bustos — clip evita torso descendo até a base */}
        <g clipPath={`url(#${idClip})`}>
          {/* esquerda — levemente menor e voltada para o centro */}
          <Person
            x={90}
            y={70}
            scale={0.92}
            rotate={6}
            hair="#3b2a1a"
            skin="#f2c9a3"
            shirt="#1b26ae"
            hairStyle="long"
            pose="left"
          />
          {/* central — maior, frontal */}
          <Person
            x={250}
            y={56}
            scale={1.05}
            hair="#1f1a12"
            skin="#c88a5a"
            shirt="#0b1252"
            tie="#ff7d3b"
            hairStyle="short"
            pose="center"
          />
          {/* direita — levemente menor e voltada para o centro */}
          <Person
            x={410}
            y={70}
            scale={0.92}
            rotate={-6}
            hair="#5a2f10"
            skin="#eab68a"
            shirt="#129cdf"
            hairStyle="bob"
            pose="right"
          />
        </g>
      </svg>

      {/* Pilha lateral de chips — apenas em xl, compacta */}
      <div
        className="pointer-events-none absolute z-[4] hidden flex-col gap-1 xl:flex"
        data-testid="hero-visual-chips"
        style={{
          right: "clamp(-14px, -1.4vw, -2px)",
          top: "10%",
          width: "clamp(96px, 10vw, 118px)",
        }}
      >
        <ChipVertical label="Clientes" color="var(--success)" />
        <ChipVertical label="Fornecedores" color="var(--secondary)" text="#0b1252" />
        <ChipVertical label="Parceiros" color="var(--accent)" text="#0b1252" />
        <ChipVertical label="Distribuidores" color="#6b57e0" text="#ffffff" />
        <ChipVertical label="Serviços" color="#129cdf" text="#0b1252" />
      </div>

      {/* Linhas curtas ligando cada card ao selo (SVG absoluto sobreposto) */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-[2] hidden md:block"
        style={{ bottom: "clamp(96px, 12vw, 132px)", height: 40, width: "100%" }}
        viewBox="0 0 620 40"
        preserveAspectRatio="none"
      >
        <path
          d="M200 4 C 240 30, 280 30, 310 30"
          stroke="var(--success)"
          strokeWidth="1.6"
          strokeDasharray="3 5"
          fill="none"
          opacity="0.8"
        />
        <path
          d="M420 4 C 380 30, 340 30, 310 30"
          stroke="var(--success)"
          strokeWidth="1.6"
          strokeDasharray="3 5"
          fill="none"
          opacity="0.8"
        />
      </svg>

      {/* Zona inferior: cards integrados + selo central generoso */}
      <div
        className="pointer-events-none absolute inset-x-0 z-[3] hidden md:block"
        data-testid="hero-visual-cards"
        style={{ bottom: "clamp(4px, 0.8vw, 16px)" }}
      >
        <div
          className="mx-auto grid items-end gap-3 px-2"
          style={{
            gridTemplateColumns: "minmax(0,1fr) minmax(140px, 170px) minmax(0,1fr)",
            maxWidth: "min(580px, 94%)",
          }}
        >
          {/* TechSolutions */}
          <div
            className="pointer-events-auto rounded-2xl border border-black/5 bg-white p-3 shadow-lg"
            style={{ minHeight: 118 }}
          >
            <div className="flex items-center gap-2">
              <Avatar tone="linear-gradient(135deg,#129cdf,#1b26ae)" initials="TS" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-[#0b1252]">TechSolutions</div>
                <span className="inline-block rounded bg-success/25 px-1.5 text-[10px] font-bold text-[#215800]">
                  OFERECE
                </span>
              </div>
            </div>
            <p
              className="mt-2 text-xs text-slate-600"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                minHeight: 32,
              }}
            >
              Automação e integração de sistemas
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="rounded-md bg-[#129cdf]/15 px-2 py-0.5 text-[10px] font-bold text-[#0b1252]">
                SERVIÇOS
              </span>
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0b1252] text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          {/* Selo central — generoso, com subtítulo */}
          <div className="relative flex justify-center" aria-hidden>
            <div
              className="pointer-events-auto w-full rounded-2xl border border-success/50 bg-white px-3 py-2.5 text-center shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)]"
              data-testid="hero-visual-match-badge"
              style={{ transform: "translateY(-14px)" }}
            >
              <div className="mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-success text-[#0b1252]">
                <Check className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 font-display text-[12px] font-bold leading-tight text-[#0b1252]">
                Match encontrado!
              </div>
              <div className="mt-0.5 text-[10px] font-medium text-slate-600">
                Interesse mútuo
              </div>
            </div>
          </div>

          {/* Indústria Alfa */}
          <div
            className="pointer-events-auto rounded-2xl border border-black/5 bg-white p-3 shadow-lg"
            style={{ minHeight: 118 }}
          >
            <div className="flex items-center gap-2">
              <Avatar tone="linear-gradient(135deg,#ff7d3b,#f04)" initials="IA" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-[#0b1252]">Indústria Alfa</div>
                <span className="inline-block rounded bg-accent/25 px-1.5 text-[10px] font-bold text-[#5c2b00]">
                  PROCURA
                </span>
              </div>
            </div>
            <p
              className="mt-2 text-xs text-slate-600"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                minHeight: 32,
              }}
            >
              Fornecedores de tecnologia e parceiros
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="rounded-md bg-secondary/20 px-2 py-0.5 text-[10px] font-bold text-[#0b1252]">
                FORNECEDORES
              </span>
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0b1252] text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ícone de grupo decorativo, canto */}
      <div
        aria-hidden
        className="absolute left-3 top-1 z-[2] rounded-full bg-white/90 p-1.5 shadow"
      >
        <Users className="h-4 w-4 text-primary" />
      </div>
    </div>
  );
}
