import { Link } from "@tanstack/react-router";
import {
  UserPlus,
  Heart,
  Handshake,
  ArrowRight,
  ChevronRight,
  Users,
  BarChart3,
  Sparkles,
  Activity,
} from "lucide-react";

import { EVENT_ID } from "@/config/event";
import { useEventStats } from "@/features/staff/useEventStats";


const STEPS = [
  { Icon: UserPlus, label: "Crie seu perfil" },
  { Icon: Sparkles, label: "Receba matches automáticos" },
  { Icon: Heart, label: "Marque interesse mútuo" },
  { Icon: Handshake, label: "A ACIRV apresenta vocês" },
] as const;

// Preview agregado do painel público — MESMA fonte de verdade (RPC event_stats
// via useEventStats), sem números hardcoded e sem regra de contagem própria.
export function formatAggregateMetric(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return `+${value}`;
}


export function ProcessPanel() {
  // Mesma query/RPC do painel público (/publico), sem infra paralela.
  const statsQuery = useEventStats(EVENT_ID);
  const stats = statsQuery.data;
  const ready = Boolean(stats) && !statsQuery.isError;
  // Erro: nada de número inventado — placeholder neutro, bloco intacto.
  const render = (v: number | undefined) =>
    statsQuery.isError ? "—" : ready ? formatAggregateMetric(v ?? 0) : null;


  const metrics: {
    Icon: typeof Users;
    label: string;
    value: string | null;
    tone: string;
  }[] = [
    {
      Icon: Users,
      label: "Participantes",
      value: render(stats?.totalProfiles),
      tone: "var(--success)",
    },
    {
      Icon: Sparkles,
      label: "Matches gerados",
      value: render(stats?.totalMatches),
      tone: "var(--secondary)",
    },
    {
      Icon: Activity,
      label: "Interesses mútuos",
      value: render(stats?.mutualMatches),
      tone: "var(--accent)",
    },
  ];

  return (

    <section className="mx-auto max-w-[1480px] px-8 pb-4 md:px-32 md:pb-5">
      <div className="relative overflow-hidden rounded-[16px] border border-secondary/40 bg-[#070d3a] p-4 text-white shadow-xl md:p-6">
        <div className="grid gap-6 lg:grid-cols-[60fr_40fr] lg:gap-0 lg:divide-x lg:divide-white/10">
          {/* Coluna 1: Como funciona */}
          <div className="text-center lg:pr-6 lg:text-left">
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
                  className="flex items-center gap-3 rounded-lg bg-white/[0.06] px-3 py-2.5 text-left ring-1 ring-white/10"
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

            {/* Desktop: quadradinhos em grid */}
            <ol className="mt-4 hidden grid-cols-4 gap-3 lg:grid" aria-label="Etapas do Matchmaker">
              {STEPS.map((s, i) => (
                <li
                  key={s.label}
                  className="relative flex h-full flex-col gap-2 rounded-lg bg-white/[0.06] p-3 text-left ring-1 ring-white/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaff00] font-display text-xs font-black text-[#0b1252]">
                      {i + 1}
                    </span>
                  </div>
                  <span className="min-w-0 text-[13px] font-medium leading-snug text-white/90">
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <ChevronRight
                      aria-hidden
                      className="absolute -right-[14px] top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
                    />
                  )}
                </li>
              ))}
            </ol>

          </div>

          {/* Coluna 2: Painel público AGREGADO */}
          <div className="text-center lg:pl-6 lg:text-left" data-testid="public-panel-aggregate">
            <div
              className="overflow-hidden rounded-lg border border-white/10 bg-white/5"
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
                  <BarChart3 className="h-3 w-3" /> DADOS DO SUDOEXPO MATCH
                </span>
              </div>
              <ul className="grid grid-cols-3 gap-1.5 p-1.5">
                {metrics.map(({ Icon, label, value, tone }) => (
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
                      {value === null ? (
                        <div
                          data-testid={`metric-skeleton-${label}`}
                          aria-label={`${label}: carregando`}
                          className="mx-auto h-[15px] w-8 animate-pulse rounded bg-slate-200"
                        />
                      ) : (
                        <div
                          data-testid={`metric-value-${label}`}
                          className="truncate font-display text-[12px] font-black leading-tight"
                        >
                          {value}
                        </div>
                      )}
                      <div className="truncate text-[9px] font-semibold text-slate-500">
                        {label}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

            </div>

            <Link
              to="/publico"
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-secondary px-3 text-sm font-semibold text-[#0b1252] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d3a]"
            >
              Acompanhar painel público <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
