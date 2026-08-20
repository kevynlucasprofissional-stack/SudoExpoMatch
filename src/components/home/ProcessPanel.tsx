import { Link } from "@tanstack/react-router";
import {
  UserPlus,
  Shuffle,
  Star,
  Handshake,
  ArrowRight,
  ChevronRight,
  Users,
  Package,
  Truck,
  Wrench,
  Handshake as HandshakeIcon,
  Boxes,
  BarChart3,
  Sparkles,
  Activity,
} from "lucide-react";

const STEPS = [
  { Icon: UserPlus, label: "Crie seu perfil" },
  { Icon: Shuffle, label: "Cruzamento de interesses" },
  { Icon: Star, label: "Avalie suas conexões" },
  { Icon: Handshake, label: "ACIRV aproxima vocês" },
] as const;

const AUDIENCE: { label: string; Icon: typeof Users; tone: string }[] = [
  { label: "Potenciais clientes", Icon: Users, tone: "var(--success)" },
  { label: "Fornecedores", Icon: Package, tone: "var(--secondary)" },
  { label: "Parceiros comerciais", Icon: HandshakeIcon, tone: "var(--accent)" },
  { label: "Distribuidores", Icon: Truck, tone: "#6b57e0" },
  { label: "Prestadores de serviços", Icon: Wrench, tone: "#129cdf" },
  { label: "Soluções complementares", Icon: Boxes, tone: "var(--warning)" },
];

// Preview agregado do painel público — não expõe empresas nomeadas
const AGGREGATE_METRICS: { Icon: typeof Users; label: string; value: string; tone: string }[] = [
  { Icon: Users, label: "Participantes", value: "+120", tone: "var(--success)" },
  { Icon: Sparkles, label: "Matches gerados", value: "+380", tone: "var(--secondary)" },
  { Icon: Activity, label: "Interesses mútuos", value: "+65", tone: "var(--accent)" },
];

export function ProcessPanel() {
  return (
    <section className="mx-auto max-w-[1480px] px-8 pb-4 md:px-32 md:pb-5">
      <div className="relative overflow-hidden rounded-[16px] border border-secondary/40 bg-[#070d3a] p-4 text-white shadow-xl md:p-6">
        <div className="grid gap-6 lg:grid-cols-[46fr_30fr_24fr] lg:gap-0 lg:divide-x lg:divide-white/10">
          {/* Coluna 1: Como funciona */}
          <div className="lg:pr-6">
            <h2 className="font-display text-xl font-black md:text-2xl">Como funciona</h2>
            {/* Mobile: sequência vertical */}
            <ol
              className="mt-4 flex flex-col gap-3 lg:hidden"
              data-testid="process-steps-mobile"
              aria-label="Etapas do Matchmaker"
            >
              {STEPS.map((s, i) => (
                <li
                  key={s.label}
                  className="flex items-center gap-3 rounded-lg bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/10"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm font-black text-[#0b1252]">
                    {i + 1}
                  </span>
                  <s.Icon aria-hidden className="h-5 w-5 shrink-0 text-white/70" />
                  <span className="min-w-0 text-sm font-medium leading-snug text-white/90">
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>

            {/* Desktop: horizontal com setas */}
            <ol className="mt-4 hidden grid-cols-4 gap-3 lg:grid" aria-label="Etapas do Matchmaker">
              {STEPS.map((s, i) => (
                <li key={s.label} className="relative">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-secondary font-display text-xs font-black text-[#0b1252]">
                        {i + 1}
                      </span>
                      {i < STEPS.length - 1 && (
                        <ChevronRight
                          aria-hidden
                          className="absolute -right-[18px] top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                        />
                      )}
                    </div>
                    <s.Icon aria-hidden className="mt-2 h-4 w-4 text-white/70" />
                    <span className="mt-1 text-[11px] font-medium leading-snug text-white/85">
                      {s.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Coluna 2: Chips com ícones */}
          <div className="lg:px-6">
            <h3 className="font-display text-base font-bold">
              Quem você pode encontrar
            </h3>
            <div
              className="mt-3 grid grid-cols-1 gap-1.5 min-[390px]:grid-cols-2"
              data-testid="audience-chips"
            >
              {AUDIENCE.map(({ label, Icon, tone }) => (
                <span
                  key={label}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white px-2.5 text-[12px] font-semibold text-[#0b1252] shadow-sm"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: tone }}
                  >
                    <Icon className="h-3 w-3 text-[#0b1252]" />
                  </span>
                  <span className="truncate">{label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Coluna 3: Painel público AGREGADO */}
          <div className="lg:pl-6" data-testid="public-panel-aggregate">
            <h3 className="font-display text-base font-bold">Painel público da SudoExpo</h3>
            <p className="mt-1 text-xs text-white/75">Números agregados, sem expor empresas.</p>
            <Link
              to="/publico"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-semibold text-[#0b1252] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d3a]"
            >
              Acompanhar painel público <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <div
              className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-white/5"
              aria-label="Prévia agregada do painel público"
            >
              <div
                aria-hidden
                className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-white/60">
                  <BarChart3 className="h-3 w-3" /> Dados da SudoExpo
                </span>
              </div>
              <ul className="grid grid-cols-3 gap-1.5 p-1.5">
                {AGGREGATE_METRICS.map(({ Icon, label, value, tone }) => (
                  <li
                    key={label}
                    className="flex flex-col items-center gap-1 rounded-md bg-white/95 p-2 text-[#0b1252]"
                  >
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#0b1252]"
                      style={{ background: tone }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="w-full min-w-0 text-center">
                      <div className="truncate font-display text-[12px] font-black leading-tight">
                        {value}
                      </div>
                      <div className="truncate text-[9px] font-semibold text-slate-500">
                        {label}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
