import { useId } from "react";
import { Plus, Check, Users } from "lucide-react";

// Ilustração editorial desktop: 3 profissionais em pé conversando numa feira,
// com estandes desfocados ao fundo, chips laterais e cards flutuantes.
// Person é construído em camadas explícitas para evitar cabelo sobre olhos
// ou pescoço atravessando a cabeça.

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
      className="flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold shadow-sm"
      style={{ background: color, color: text ?? "#0b1252" }}
    >
      {label}
    </div>
  );
}

/**
 * Person — silhueta vetorial construída em camadas ordenadas para eliminar
 * problemas visuais como cabelo sobre os olhos, "careca" no topo, ou
 * pescoço atravessando a cabeça.
 *
 * Camadas (traseira → frente):
 *  1. hairBack   — massa traseira do cabelo (atrás do rosto)
 *  2. neck       — pescoço (atrás do tronco)
 *  3. torso      — ombros, camisa, braços
 *  4. face       — cabeça e orelhas
 *  5. hairFront  — franja/coroa, cobre topo do crânio sem invadir olhos
 *  6. features   — olhos, sobrancelhas, sorriso
 *  7. wearFront  — gola, gravata, cordão e crachá em primeiro plano
 *
 * Todo o corpo é centralizado em x=60 dentro do grupo (cabeça, pescoço,
 * gola, gravata, cordão, crachá compartilham o mesmo eixo).
 */
function Person({
  x,
  hair,
  skin,
  shirt,
  tie,
  hairStyle = "short",
  pose = "center",
}: {
  x: number;
  hair: string;
  skin: string;
  shirt: string;
  tie?: string;
  hairStyle?: "short" | "long" | "bob";
  pose?: "left" | "center" | "right";
}) {
  // sombra facial sutil (bochecha)
  const faceShade = "rgba(0,0,0,0.06)";
  const eyeY = 54;

  return (
    <g transform={`translate(${x} 0)`} data-person-pose={pose}>
      {/* 1. hairBack — atrás do rosto */}
      <g data-layer="hair-back">
        {hairStyle === "long" && (
          <path
            d="M34 46 C 34 20, 86 20, 86 46 L 90 108 L 78 108 C 78 82, 76 66, 60 66 C 44 66, 42 82, 42 108 L 30 108 Z"
            fill={hair}
          />
        )}
        {hairStyle === "bob" && (
          <path
            d="M34 44 C 34 18, 86 18, 86 44 L 88 82 L 78 82 C 78 70, 72 62, 60 62 C 48 62, 42 70, 42 82 L 32 82 Z"
            fill={hair}
          />
        )}
        {hairStyle === "short" && (
          <path d="M38 46 C 38 26, 82 26, 82 46 L 84 62 L 36 62 Z" fill={hair} opacity="0.9" />
        )}
      </g>

      {/* 2. pescoço (atrás do tronco/gola) */}
      <g data-layer="neck">
        <rect x="54" y="72" width="12" height="16" fill={skin} />
        {/* sombra do queixo */}
        <rect x="54" y="72" width="12" height="4" fill="rgba(0,0,0,0.08)" />
      </g>

      {/* 3. tronco / ombros / braços */}
      <g data-layer="torso">
        <path d="M6 200 C 6 130, 30 100, 60 100 C 90 100, 114 130, 114 200 Z" fill={shirt} />
        {/* braços em gesto */}
        {pose === "left" && (
          <path
            d="M18 140 C 8 160, 6 180, 20 190 L 30 180 C 24 170, 28 160, 34 152 Z"
            fill={shirt}
          />
        )}
        {pose === "right" && (
          <path
            d="M102 140 C 112 160, 114 180, 100 190 L 90 180 C 96 170, 92 160, 86 152 Z"
            fill={shirt}
          />
        )}
        {pose === "center" && (
          <>
            <path
              d="M22 140 C 12 156, 12 172, 24 180 L 34 172 C 30 164, 34 156, 40 150 Z"
              fill={shirt}
            />
            <path
              d="M98 140 C 108 156, 108 172, 96 180 L 86 172 C 90 164, 86 156, 80 150 Z"
              fill={shirt}
            />
            {/* mãos */}
            <circle cx="26" cy="182" r="5.5" fill={skin} />
            <circle cx="94" cy="182" r="5.5" fill={skin} />
          </>
        )}
      </g>

      {/* 4. rosto e orelhas */}
      <g data-layer="face">
        {/* orelhas discretas */}
        <ellipse cx="37" cy="54" rx="3" ry="5" fill={skin} />
        <ellipse cx="83" cy="54" rx="3" ry="5" fill={skin} />
        {/* rosto */}
        <ellipse cx="60" cy="52" rx="24" ry="28" fill={skin} />
        {/* sombra sutil na bochecha */}
        <ellipse cx="60" cy="66" rx="18" ry="6" fill={faceShade} />
      </g>

      {/* 5. hairFront — franja/coroa cobrindo topo, sem invadir olhos */}
      <g data-layer="hair-front">
        {hairStyle === "short" && (
          <path
            d="M36 46 C 40 28, 80 28, 84 46 C 78 40, 68 38, 60 40 C 52 38, 42 40, 36 46 Z"
            fill={hair}
          />
        )}
        {hairStyle === "long" && (
          // coroa cobre o topo até altura das sobrancelhas (~y=46), sem cobrir os olhos (y=54)
          <path
            d="M34 48 C 34 22, 86 22, 86 48 C 80 40, 72 38, 62 40 C 56 40, 52 42, 48 44 C 44 42, 38 44, 34 48 Z"
            fill={hair}
          />
        )}
        {hairStyle === "bob" && (
          // franja lateral que enquadra o rosto sem cobrir olhos
          <path
            d="M34 46 C 34 22, 86 22, 86 46 C 82 40, 74 40, 66 42 C 60 40, 54 42, 50 44 C 44 42, 38 42, 34 46 Z"
            fill={hair}
          />
        )}
      </g>

      {/* 6. features — olhos e sorriso */}
      <g data-layer="features">
        {/* sobrancelhas suaves */}
        <path
          d="M48 48 Q 52 46 56 48"
          stroke="#0b1252"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M64 48 Q 68 46 72 48"
          stroke="#0b1252"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* olhos alinhados */}
        <circle cx="52" cy={eyeY} r="1.7" fill="#0b1252" />
        <circle cx="68" cy={eyeY} r="1.7" fill="#0b1252" />
        {/* sorriso */}
        <path
          d="M52 63 Q 60 69 68 63"
          stroke="#0b1252"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* 7. gola, gravata, cordão, crachá — em primeiro plano, eixo em x=60 */}
      <g data-layer="wear-front">
        {/* lapelas simétricas */}
        <path d="M60 100 L 44 140 L 60 150 L 76 140 Z" fill="#ffffff" opacity="0.92" />
        {/* gravata (mais curta para não conflitar com o crachá) */}
        {tie && <rect x="56" y="118" width="8" height="18" fill={tie} rx="1" />}
        {/* cordão do crachá — simétrico */}
        <path d="M46 108 C 54 120 66 120 74 108" stroke="#f1ff0a" strokeWidth="2" fill="none" />
        {/* crachá abaixo da gravata */}
        <rect x="52" y="140" width="16" height="18" rx="2" fill="#ffffff" />
        <rect x="55" y="144" width="10" height="2" fill="#0b1252" />
        <rect x="55" y="148" width="8" height="1.5" fill="#0b1252" opacity="0.6" />
        <rect x="55" y="151" width="9" height="1.5" fill="#0b1252" opacity="0.5" />
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

  return (
    <div
      className="relative isolate mx-auto w-full max-w-[620px]"
      data-testid="hero-visual-desktop-root"
      style={{ paddingBottom: "clamp(64px, 8vw, 96px)" }}
    >
      {/* Recorte de papel branco irregular ao fundo */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-4 mx-auto h-[360px] w-[94%] bg-white/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]"
        style={{
          clipPath:
            "polygon(2% 8%, 96% 3%, 99% 22%, 97% 55%, 100% 84%, 92% 97%, 60% 94%, 32% 99%, 6% 96%, 0% 78%, 3% 42%, 0 18%)",
        }}
      />

      {/* Cena principal em SVG */}
      <svg
        viewBox="0 0 620 400"
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
            <stop offset="0" stopColor="#1b26ae" stopOpacity="0.35" />
            <stop offset="1" stopColor="#1b26ae" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id={idBoothB} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#129cdf" stopOpacity="0.35" />
            <stop offset="1" stopColor="#129cdf" stopOpacity="0.1" />
          </linearGradient>
          <filter id={idSoft} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Faixa de fundo (feira) — estandes desfocados */}
        <g aria-hidden="true">
          <rect x="20" y="40" width="580" height="150" rx="12" fill={`url(#${idBg})`} />
          <g filter={`url(#${idSoft})`} opacity="0.9">
            <rect x="40" y="70" width="90" height="110" fill={`url(#${idBoothA})`} rx="6" />
            <rect x="140" y="60" width="110" height="120" fill={`url(#${idBoothB})`} rx="6" />
            <rect x="260" y="72" width="90" height="108" fill={`url(#${idBoothA})`} rx="6" />
            <rect x="360" y="58" width="120" height="122" fill={`url(#${idBoothB})`} rx="6" />
            <rect x="490" y="74" width="90" height="106" fill={`url(#${idBoothA})`} rx="6" />
            <rect x="50" y="80" width="70" height="12" fill="#1b26ae" opacity="0.5" rx="2" />
            <rect x="150" y="72" width="90" height="12" fill="#129cdf" opacity="0.55" rx="2" />
            <rect x="370" y="70" width="100" height="12" fill="#129cdf" opacity="0.55" rx="2" />
          </g>
          <g fill="#1b26ae" opacity="0.25" filter={`url(#${idSoft})`}>
            <circle cx="80" cy="180" r="10" />
            <circle cx="120" cy="182" r="9" />
            <circle cx="180" cy="180" r="11" />
            <circle cx="230" cy="184" r="9" />
            <circle cx="290" cy="180" r="10" />
            <circle cx="340" cy="184" r="9" />
            <circle cx="400" cy="180" r="11" />
            <circle cx="460" cy="182" r="9" />
            <circle cx="520" cy="180" r="10" />
            <circle cx="560" cy="184" r="9" />
          </g>
        </g>

        {/* Linhas curvas de conexão */}
        <g fill="none" strokeWidth="2" opacity="0.85" aria-hidden="true">
          <path
            d="M150 120 C 240 78, 380 78, 470 120"
            stroke="var(--warning)"
            strokeDasharray="4 6"
          />
          <path
            d="M180 300 C 260 336, 360 336, 440 300"
            stroke="var(--success)"
            strokeDasharray="4 6"
          />
        </g>
        <g aria-hidden="true">
          <circle cx="150" cy="120" r="4" fill="var(--warning)" />
          <circle cx="470" cy="120" r="4" fill="var(--warning)" />
          <circle cx="180" cy="300" r="4" fill="var(--success)" />
          <circle cx="440" cy="300" r="4" fill="var(--success)" />
        </g>

        {/* Três profissionais em pé, em conversa */}
        <Person x={90} hair="#3b2a1a" skin="#f2c9a3" shirt="#1b26ae" hairStyle="long" pose="left" />
        <Person
          x={250}
          hair="#1f1a12"
          skin="#c88a5a"
          shirt="#0b1252"
          tie="#ff7d3b"
          hairStyle="short"
          pose="center"
        />
        <Person
          x={410}
          hair="#5a2f10"
          skin="#eab68a"
          shirt="#129cdf"
          hairStyle="bob"
          pose="right"
        />

        {/* Piso — leve sombra */}
        <ellipse cx="310" cy="345" rx="240" ry="10" fill="#0b1252" opacity="0.18" />
      </svg>

      {/* Pilha lateral de chips — coluna dedicada, sem invadir cards */}
      <div
        className="pointer-events-none absolute z-[4] hidden flex-col gap-1.5 md:flex"
        data-testid="hero-visual-chips"
        style={{
          right: "clamp(-8px, -1vw, 4px)",
          top: "20%",
          width: "clamp(110px, 12vw, 140px)",
        }}
      >
        <ChipVertical label="Clientes" color="var(--success)" />
        <ChipVertical label="Fornecedores" color="var(--secondary)" text="#0b1252" />
        <ChipVertical label="Parceiros" color="var(--accent)" text="#0b1252" />
        <ChipVertical label="Distribuidores" color="#6b57e0" text="#ffffff" />
        <ChipVertical label="Serviços" color="#129cdf" text="#0b1252" />
      </div>

      {/* Zona inferior: dois cards + selo central, layout com grid explícito */}
      <div
        className="pointer-events-none absolute inset-x-0 z-[3] hidden md:block"
        data-testid="hero-visual-cards"
        style={{ bottom: "clamp(8px, 1.5vw, 24px)" }}
      >
        <div
          className="mx-auto grid items-end gap-3 px-2"
          style={{
            gridTemplateColumns: "minmax(0,1fr) minmax(80px, 110px) minmax(0,1fr)",
            maxWidth: "min(560px, 92%)",
          }}
        >
          {/* TechSolutions — esquerda */}
          <div
            className="pointer-events-auto rounded-2xl border border-black/5 bg-white p-3 shadow-lg"
            style={{ minHeight: 122 }}
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

          {/* Coluna central reservada — o selo de match ocupa esta zona */}
          <div className="relative flex justify-center" aria-hidden>
            <div
              className="pointer-events-auto w-full rounded-2xl border border-success/40 bg-white p-2 text-center shadow-xl"
              data-testid="hero-visual-match-badge"
              style={{ transform: "translateY(6px)" }}
            >
              <div className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-success text-[#0b1252]">
                <Check className="h-4 w-4" />
              </div>
              <div className="mt-1 font-display text-[11px] font-bold leading-tight text-[#0b1252]">
                Match
                <br />
                encontrado!
              </div>
            </div>
          </div>

          {/* Indústria Alfa — direita */}
          <div
            className="pointer-events-auto rounded-2xl border border-black/5 bg-white p-3 shadow-lg"
            style={{ minHeight: 122 }}
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
