import { Plus, Check, Users } from "lucide-react";

// Ilustração editorial: silhuetas/avatares vetoriais + cards flutuantes + linhas de conexão.
// Tudo em SVG/CSS — sem depender de asset externo.

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

function ChipVertical({
  label,
  color,
  text,
}: {
  label: string;
  color: string;
  text?: string;
}) {
  return (
    <div
      className="flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold shadow-sm"
      style={{ background: color, color: text ?? "#0b1252" }}
    >
      {label}
    </div>
  );
}

export function HeroVisual() {
  return (
    <div className="relative isolate mx-auto w-full max-w-[640px]">
      {/* Recorte de papel de fundo */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-8 mx-auto h-[380px] w-[92%] rounded-[28px] bg-white/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]"
        style={{
          clipPath:
            "polygon(2% 8%, 96% 3%, 99% 22%, 97% 55%, 100% 84%, 92% 97%, 60% 94%, 32% 99%, 6% 96%, 0% 78%, 3% 42%, 0 18%)",
        }}
      />
      {/* Faixa azul translúcida (banner de evento) */}
      <div
        aria-hidden
        className="absolute left-[6%] right-[6%] top-16 h-8 rounded-md bg-secondary/60 backdrop-blur-sm"
      />

      {/* Silhuetas — 3 profissionais em conversa */}
      <svg
        viewBox="0 0 640 420"
        className="relative z-[1] w-full"
        aria-label="Três profissionais conectados em uma feira"
        role="img"
      >
        {/* linhas curvas de conexão */}
        <g fill="none" strokeWidth="2" opacity="0.9">
          <path d="M100 120 C 200 60, 380 60, 520 120" stroke="var(--warning)" strokeDasharray="4 6" />
          <path d="M120 300 C 250 360, 420 360, 540 300" stroke="var(--success)" strokeDasharray="4 6" />
          <path d="M320 80 C 340 180, 320 240, 320 340" stroke="var(--accent)" strokeDasharray="4 6" opacity="0.6" />
        </g>
        {/* pontos */}
        {[
          [100, 120, "var(--warning)"],
          [520, 120, "var(--warning)"],
          [120, 300, "var(--success)"],
          [540, 300, "var(--success)"],
          [320, 80, "var(--accent)"],
          [320, 340, "var(--accent)"],
        ].map(([x, y, c], i) => (
          <circle key={i} cx={x as number} cy={y as number} r="5" fill={c as string} />
        ))}

        {/* Três figuras estilizadas */}
        <g transform="translate(160 140)">
          <circle cx="40" cy="30" r="26" fill="#F4C99A" />
          <path d="M0 130 C 0 80, 80 80, 80 130 L 80 200 L 0 200 Z" fill="#1b26ae" />
          <rect x="16" y="90" width="48" height="18" rx="4" fill="#ffffff" opacity="0.85" />
        </g>
        <g transform="translate(280 120)">
          <circle cx="40" cy="30" r="28" fill="#C88A5A" />
          <path d="M-4 140 C -4 82, 84 82, 84 140 L 84 220 L -4 220 Z" fill="#129cdf" />
          <rect x="14" y="96" width="52" height="18" rx="4" fill="#ffffff" opacity="0.9" />
        </g>
        <g transform="translate(400 150)">
          <circle cx="40" cy="30" r="26" fill="#E8B58A" />
          <path d="M0 130 C 0 80, 80 80, 80 130 L 80 200 L 0 200 Z" fill="#ff7d3b" />
          <rect x="16" y="90" width="48" height="18" rx="4" fill="#ffffff" opacity="0.85" />
        </g>
      </svg>

      {/* Chips verticais à direita */}
      <div className="pointer-events-none absolute right-[-4px] top-1/2 z-[2] hidden -translate-y-1/2 flex-col gap-2 sm:flex">
        <ChipVertical label="Clientes" color="var(--success)" />
        <ChipVertical label="Fornecedores" color="var(--secondary)" text="#0b1252" />
        <ChipVertical label="Parceiros" color="var(--accent)" text="#0b1252" />
        <ChipVertical label="Distribuidores" color="#6b57e0" text="#ffffff" />
        <ChipVertical label="Serviços" color="#129cdf" text="#0b1252" />
      </div>

      {/* Card flutuante esquerdo — OFERECE */}
      <div className="absolute left-[-6px] top-[52%] z-[3] w-[240px] rounded-2xl border border-black/5 bg-white p-3 shadow-xl sm:left-[-16px]">
        <div className="flex items-center gap-2">
          <Avatar tone="linear-gradient(135deg,#129cdf,#1b26ae)" initials="TS" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[#0b1252]">TechSolutions</div>
            <span className="inline-block rounded bg-success/25 px-1.5 text-[10px] font-bold text-[#215800]">
              OFERECE
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Soluções em automação e integração de sistemas
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="rounded-md bg-[#129cdf]/15 px-2 py-0.5 text-[10px] font-bold text-[#0b1252]">
            SERVIÇOS
          </span>
          <button
            aria-label="Adicionar interesse"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1252] text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Card flutuante direito — PROCURA */}
      <div className="absolute right-[-6px] top-[10%] z-[3] w-[240px] rounded-2xl border border-black/5 bg-white p-3 shadow-xl sm:right-[-16px]">
        <div className="flex items-center gap-2">
          <Avatar tone="linear-gradient(135deg,#ff7d3b,#f04)" initials="IA" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[#0b1252]">Indústria Alfa</div>
            <span className="inline-block rounded bg-accent/25 px-1.5 text-[10px] font-bold text-[#5c2b00]">
              PROCURA
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Fornecedores de tecnologia e parceiros estratégicos
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="rounded-md bg-secondary/20 px-2 py-0.5 text-[10px] font-bold text-[#0b1252]">
            FORNECEDORES
          </span>
          <button
            aria-label="Adicionar interesse"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1252] text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Card central inferior — Match */}
      <div className="relative z-[3] mx-auto mt-4 w-[260px] rounded-2xl border border-success/40 bg-white p-3 text-center shadow-xl sm:-mt-2">
        <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-success text-[#0b1252]">
          <Check className="h-5 w-5" />
        </div>
        <div className="mt-1 font-display text-sm font-bold text-[#0b1252]">
          Match encontrado!
        </div>
        <div className="text-xs font-semibold text-success-foreground/80" style={{ color: "#0b1252" }}>
          Interesse mútuo
        </div>
        <div className="text-[11px] text-slate-500">Vamos aproximar vocês.</div>
      </div>

      {/* Setas apontando para o card central */}
      <svg
        aria-hidden
        viewBox="0 0 640 200"
        className="pointer-events-none absolute inset-x-0 bottom-6 z-[2] h-16 w-full"
      >
        <path d="M110 40 C 200 120, 260 140, 300 150" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M300 150 l -10 -4 l 4 10 z" fill="#ffffff" />
        <path d="M530 40 C 440 120, 380 140, 340 150" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M340 150 l 10 -4 l -4 10 z" fill="#ffffff" />
      </svg>

      {/* Ícone de grupo decorativo, canto */}
      <div aria-hidden className="absolute left-4 top-2 z-[2] rounded-full bg-white/90 p-1.5 shadow">
        <Users className="h-4 w-4 text-primary" />
      </div>
    </div>
  );
}
