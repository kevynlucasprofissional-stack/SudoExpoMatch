import { Check, Building2, Search } from "lucide-react";

/**
 * Composição mobile do hero.
 * - HTML/CSS + SVG leve, sem imagem remota.
 * - Dois cartões profissionais (OFERECE / PROCURA) conectados por curvas
 *   sutis, com selo central "Match encontrado".
 * - Cabe em 320–430px sem corte; altura ~clamp(260px, 78vw, 340px).
 * - Respeita prefers-reduced-motion (animações pausadas via CSS).
 */
export function HeroVisualMobile() {
  return (
    <div
      role="img"
      aria-label="Ilustração: dois cartões de empresas conectados por um selo verde indicando match encontrado por interesse mútuo."
      className="relative mx-auto w-full max-w-[420px]"
      style={{ height: "clamp(260px, 78vw, 340px)" }}
    >
      {/* Camada de linhas/curvas de conexão + pontos decorativos */}
      <svg
        aria-hidden
        viewBox="0 0 400 320"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="hm-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8bec01" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff7d3b" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Curva ligando o cartão esquerdo ao selo central */}
        <path
          d="M 90 210 C 130 210, 150 190, 200 175"
          fill="none"
          stroke="url(#hm-line)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="4 6"
          opacity="0.85"
        />
        {/* Curva ligando o selo central ao cartão direito */}
        <path
          d="M 200 175 C 260 160, 285 145, 315 130"
          fill="none"
          stroke="url(#hm-line)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="4 6"
          opacity="0.85"
        />

        {/* Pontinhos decorativos */}
        <g fill="#ffffff" opacity="0.35">
          <circle cx="40" cy="60" r="1.6" />
          <circle cx="360" cy="70" r="1.6" />
          <circle cx="60" cy="290" r="1.6" />
          <circle cx="340" cy="280" r="1.6" />
          <circle cx="200" cy="40" r="1.6" />
          <circle cx="150" cy="300" r="1.6" />
          <circle cx="280" cy="300" r="1.6" />
        </g>
      </svg>

      {/* Cartão esquerdo — OFERECE */}
      <article
        className="absolute left-[2%] top-[38%] w-[46%] max-w-[190px] -rotate-2 rounded-xl bg-white p-3 text-[#0b1252] shadow-[0_12px_30px_-14px_rgba(0,0,0,0.55)]"
        aria-hidden
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
            style={{ background: "var(--secondary)" }}
          >
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">
              Oferece
            </div>
            <div className="truncate text-[11px] font-bold leading-tight">TechSolutions</div>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] font-medium leading-snug text-slate-600">
          Automação e sistemas para indústria
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span
            className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold text-[#0b1252]"
            style={{ background: "var(--secondary)" }}
          >
            Software
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold text-[#0b1252]"
            style={{ background: "color-mix(in oklab, var(--secondary) 25%, white)" }}
          >
            SaaS
          </span>
        </div>
      </article>

      {/* Cartão direito — PROCURA */}
      <article
        className="absolute right-[2%] top-[8%] w-[46%] max-w-[190px] rotate-2 rounded-xl bg-white p-3 text-[#0b1252] shadow-[0_12px_30px_-14px_rgba(0,0,0,0.55)]"
        aria-hidden
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b1252]"
            style={{ background: "var(--accent)" }}
          >
            <Search className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">
              Procura
            </div>
            <div className="truncate text-[11px] font-bold leading-tight">Indústria Alfa</div>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] font-medium leading-snug text-slate-600">
          Fornecedores de tecnologia e automação
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span
            className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold text-[#0b1252]"
            style={{ background: "var(--accent)" }}
          >
            Tecnologia
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold text-white"
            style={{ background: "#6b57e0" }}
          >
            Parceiro
          </span>
        </div>
      </article>

      {/* Selo central — Match encontrado */}
      <div
        className="absolute left-1/2 top-[50%] w-[68%] max-w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-3 text-[#0b1252] shadow-[0_20px_40px_-16px_rgba(0,0,0,0.6)] ring-1 ring-black/5"
        aria-hidden
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0b1252]"
            style={{ background: "var(--success)" }}
          >
            <Check className="h-5 w-5" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[13px] font-black leading-tight">
              Match encontrado
            </div>
            <div className="text-[10.5px] font-semibold text-slate-500">Interesse mútuo</div>
          </div>
        </div>
        <div
          aria-hidden
          className="mt-2 h-1 w-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, var(--secondary), var(--success) 55%, var(--accent))",
          }}
        />
      </div>
    </div>
  );
}
