import { Plus, Check, Users } from "lucide-react";

// Ilustração editorial: 3 profissionais em pé conversando numa feira,
// com estandes desfocados ao fundo, recorte de papel, chips laterais e cards flutuantes.

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

// Silhueta detalhada de um profissional (cabelo, rosto, ombros, braços, crachá).
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
  return (
    <g transform={`translate(${x} 0)`}>
      {/* pescoço */}
      <rect x="52" y="70" width="16" height="18" fill={skin} />
      {/* ombros/torso */}
      <path d="M6 200 C 6 130, 30 100, 60 100 C 90 100, 114 130, 114 200 Z" fill={shirt} />
      {/* lapelas */}
      <path d="M60 100 L 44 140 L 60 150 L 76 140 Z" fill="#ffffff" opacity="0.9" />
      {tie && <rect x="56" y="118" width="8" height="34" fill={tie} />}
      {/* crachá + cordão */}
      <path d={`M46 108 C 54 118 66 118 74 108`} stroke="#f1ff0a" strokeWidth="2" fill="none" />
      <rect x="54" y="118" width="12" height="14" rx="1.5" fill="#ffffff" />
      <rect x="56" y="121" width="8" height="2" fill="#0b1252" />
      <rect x="56" y="125" width="6" height="1.5" fill="#0b1252" />
      {/* braço em gesto */}
      {pose === "left" && (
        <path d="M18 140 C 8 160, 6 180, 20 190 L 30 180 C 24 170, 28 160, 34 152 Z" fill={shirt} />
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
          <circle cx="24" cy="182" r="6" fill={skin} />
          <circle cx="96" cy="182" r="6" fill={skin} />
        </>
      )}
      {/* rosto */}
      <ellipse cx="60" cy="52" rx="24" ry="28" fill={skin} />
      {/* olhos */}
      <circle cx="52" cy="52" r="1.6" fill="#0b1252" />
      <circle cx="68" cy="52" r="1.6" fill="#0b1252" />
      {/* sorriso */}
      <path
        d="M52 62 Q 60 68 68 62"
        stroke="#0b1252"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      {/* cabelo */}
      {hairStyle === "short" && (
        <path
          d="M36 46 C 36 24, 84 24, 84 46 C 84 40, 78 34, 60 34 C 42 34, 36 40, 36 46 Z"
          fill={hair}
        />
      )}
      {hairStyle === "long" && (
        <path
          d="M34 50 C 34 22, 86 22, 86 50 L 90 96 L 78 96 C 78 72, 76 58, 60 58 C 44 58, 42 72, 42 96 L 30 96 Z"
          fill={hair}
        />
      )}
      {hairStyle === "bob" && (
        <path
          d="M32 52 C 32 20, 88 20, 88 52 L 86 72 L 76 68 C 76 56, 72 46, 60 46 C 48 46, 44 56, 44 68 L 34 72 Z"
          fill={hair}
        />
      )}
    </g>
  );
}

export function HeroVisual() {
  return (
    <div className="relative isolate mx-auto w-full max-w-[620px]">
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
        aria-label="Três profissionais conversando numa feira, com estandes ao fundo"
        role="img"
      >
        <defs>
          <linearGradient id="fair-bg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#dbeafe" />
            <stop offset="1" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id="booth-a" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1b26ae" stopOpacity="0.35" />
            <stop offset="1" stopColor="#1b26ae" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="booth-b" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#129cdf" stopOpacity="0.35" />
            <stop offset="1" stopColor="#129cdf" stopOpacity="0.1" />
          </linearGradient>
          <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Faixa de fundo (feira) — estandes desfocados */}
        <g>
          <rect x="20" y="40" width="580" height="150" rx="12" fill="url(#fair-bg)" />
          <g filter="url(#soft)" opacity="0.9">
            <rect x="40" y="70" width="90" height="110" fill="url(#booth-a)" rx="6" />
            <rect x="140" y="60" width="110" height="120" fill="url(#booth-b)" rx="6" />
            <rect x="260" y="72" width="90" height="108" fill="url(#booth-a)" rx="6" />
            <rect x="360" y="58" width="120" height="122" fill="url(#booth-b)" rx="6" />
            <rect x="490" y="74" width="90" height="106" fill="url(#booth-a)" rx="6" />
            {/* banners */}
            <rect x="50" y="80" width="70" height="12" fill="#1b26ae" opacity="0.5" rx="2" />
            <rect x="150" y="72" width="90" height="12" fill="#129cdf" opacity="0.55" rx="2" />
            <rect x="370" y="70" width="100" height="12" fill="#129cdf" opacity="0.55" rx="2" />
          </g>
          {/* silhuetas de público desfocadas */}
          <g fill="#1b26ae" opacity="0.25" filter="url(#soft)">
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
        <g fill="none" strokeWidth="2" opacity="0.85">
          <path
            d="M120 130 C 220 80, 400 80, 520 130"
            stroke="var(--warning)"
            strokeDasharray="4 6"
          />
          <path
            d="M160 300 C 260 340, 380 340, 480 300"
            stroke="var(--success)"
            strokeDasharray="4 6"
          />
        </g>
        <g>
          <circle cx="120" cy="130" r="4" fill="var(--warning)" />
          <circle cx="520" cy="130" r="4" fill="var(--warning)" />
          <circle cx="160" cy="300" r="4" fill="var(--success)" />
          <circle cx="480" cy="300" r="4" fill="var(--success)" />
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

      {/* Chips verticais à direita — dentro do container */}
      <div className="pointer-events-none absolute right-2 top-1/2 z-[2] hidden -translate-y-1/2 flex-col gap-1.5 md:flex">
        <ChipVertical label="Clientes" color="var(--success)" />
        <ChipVertical label="Fornecedores" color="var(--secondary)" text="#0b1252" />
        <ChipVertical label="Parceiros" color="var(--accent)" text="#0b1252" />
        <ChipVertical label="Distribuidores" color="#6b57e0" text="#ffffff" />
        <ChipVertical label="Serviços" color="#129cdf" text="#0b1252" />
      </div>

      {/* Chips em linha rolável no mobile */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-2 md:hidden">
        <ChipVertical label="Clientes" color="var(--success)" />
        <ChipVertical label="Fornecedores" color="var(--secondary)" text="#0b1252" />
        <ChipVertical label="Parceiros" color="var(--accent)" text="#0b1252" />
        <ChipVertical label="Distribuidores" color="#6b57e0" text="#ffffff" />
        <ChipVertical label="Serviços" color="#129cdf" text="#0b1252" />
      </div>

      {/* Desktop: cards flutuantes posicionados como no conceito */}
      <div className="pointer-events-none absolute inset-0 z-[3] hidden md:block">
        {/* TechSolutions — inferior esquerdo */}
        <div className="pointer-events-auto absolute left-[-8px] bottom-[-8px] w-[220px] rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
          <div className="flex items-center gap-2">
            <Avatar tone="linear-gradient(135deg,#129cdf,#1b26ae)" initials="TS" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#0b1252]">TechSolutions</div>
              <span className="inline-block rounded bg-success/25 px-1.5 text-[10px] font-bold text-[#215800]">
                OFERECE
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">Automação e integração de sistemas</p>
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

        {/* Indústria Alfa — inferior direito */}
        <div className="pointer-events-auto absolute right-[52px] bottom-[-8px] w-[220px] rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
          <div className="flex items-center gap-2">
            <Avatar tone="linear-gradient(135deg,#ff7d3b,#f04)" initials="IA" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#0b1252]">Indústria Alfa</div>
              <span className="inline-block rounded bg-accent/25 px-1.5 text-[10px] font-bold text-[#5c2b00]">
                PROCURA
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">Fornecedores de tecnologia e parceiros</p>
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

        {/* Match encontrado — centralizado abaixo, sobrepondo levemente */}
        <div className="pointer-events-auto absolute left-1/2 bottom-[-36px] w-[220px] -translate-x-1/2 rounded-2xl border border-success/40 bg-white p-3 text-center shadow-xl">
          <div className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-success text-[#0b1252]">
            <Check className="h-4 w-4" />
          </div>
          <div className="mt-1 font-display text-sm font-bold text-[#0b1252]">
            Match encontrado!
          </div>
          <div className="text-[11px] text-slate-500">Vamos aproximar vocês.</div>
        </div>
      </div>

      {/* Mobile: cards em coluna abaixo */}
      <div className="mt-4 grid gap-2 md:hidden">
        <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <Avatar tone="linear-gradient(135deg,#129cdf,#1b26ae)" initials="TS" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#0b1252]">TechSolutions</div>
              <span className="inline-block rounded bg-success/25 px-1.5 text-[10px] font-bold text-[#215800]">
                OFERECE
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <Avatar tone="linear-gradient(135deg,#ff7d3b,#f04)" initials="IA" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#0b1252]">Indústria Alfa</div>
              <span className="inline-block rounded bg-accent/25 px-1.5 text-[10px] font-bold text-[#5c2b00]">
                PROCURA
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-success/40 bg-white p-3 text-center shadow-lg">
          <div className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-success text-[#0b1252]">
            <Check className="h-4 w-4" />
          </div>
          <div className="mt-1 font-display text-sm font-bold text-[#0b1252]">
            Match encontrado!
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
