import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, HeartHandshake, Sparkles, Users, Handshake } from "lucide-react";

import { EVENT_ID } from "@/config/event";
import { NetworkGraphic } from "@/components/brand/NetworkGraphic";
import { useEventStats } from "@/features/staff/useEventStats";

export const Route = createFileRoute("/publico")({
  head: () => ({
    meta: [
      { title: "Painel público — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Painel para TV/LED com estatísticas agregadas do Matchmaker SudoExpo em tempo real.",
      },
      { property: "og:title", content: "Painel público — Matchmaker SudoExpo" },
      {
        property: "og:description",
        content: "Estatísticas ao vivo das conexões geradas na SudoExpo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicBoard,
});

type Tone = "cyan" | "violet" | "lime" | "orange";

const TONES: Record<Tone, { ring: string; glow: string; icon: string; accent: string }> = {
  cyan: {
    ring: "border-secondary/40",
    glow: "radial-gradient(120% 120% at 15% 0%, color-mix(in oklab, var(--secondary) 26%, transparent) 0%, transparent 62%)",
    icon: "bg-secondary/20 text-secondary",
    accent: "var(--secondary)",
  },
  violet: {
    ring: "border-[#6f7bff]/45",
    glow: "radial-gradient(120% 120% at 15% 0%, rgba(111,123,255,0.28) 0%, transparent 62%)",
    icon: "bg-[#6f7bff]/20 text-[#a8b1ff]",
    accent: "#8f9bff",
  },
  lime: {
    ring: "border-success/45",
    glow: "radial-gradient(120% 120% at 15% 0%, color-mix(in oklab, var(--success) 22%, transparent) 0%, transparent 62%)",
    icon: "bg-success/20 text-success",
    accent: "var(--success)",
  },
  orange: {
    ring: "border-accent/45",
    glow: "radial-gradient(120% 120% at 15% 0%, color-mix(in oklab, var(--accent) 24%, transparent) 0%, transparent 62%)",
    icon: "bg-accent/20 text-accent",
    accent: "var(--accent)",
  },
};

function PublicBoard() {
  // Relógio: 100% local, montado só após hidratação (sem mismatch, sem backend).
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Mesma fonte de verdade de sempre: RPC event_stats via useEventStats.
  const statsQuery = useEventStats(EVENT_ID, { refetchMs: 10_000 });
  const stats = statsQuery.data;
  const ready = Boolean(stats) && !statsQuery.isError;
  const value = (v: number | undefined) => (statsQuery.isError ? "—" : ready ? String(v ?? 0) : null);

  const metrics: { key: string; label: string; icon: typeof Users; tone: Tone; value: string | null }[] =
    [
      {
        key: "participantes",
        label: "Participantes",
        icon: Users,
        tone: "cyan",
        value: value(stats?.totalProfiles),
      },
      {
        key: "matches",
        label: "Matches gerados",
        icon: Sparkles,
        tone: "violet",
        value: value(stats?.totalMatches),
      },
      {
        key: "interesse-mutuo",
        label: "Interesse mútuo",
        icon: HeartHandshake,
        tone: "lime",
        value: value(stats?.mutualMatches),
      },
      {
        key: "conexoes-concluidas",
        label: "Conexões concluídas",
        icon: Handshake,
        tone: "orange",
        value: value(stats?.completedConnections),
      },
    ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050a2e] text-white">
      {/* Fundo: azul-marinho profundo + gradientes radiais + pontos sutis */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 18% 8%, rgba(27,38,174,0.55) 0%, transparent 60%), radial-gradient(70% 60% at 88% 12%, rgba(18,156,223,0.28) 0%, transparent 60%), radial-gradient(90% 70% at 50% 110%, rgba(111,123,255,0.22) 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      {/* Espaço reservado para o grafismo de conexão (animações ficam para depois) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <NetworkGraphic className="h-full w-full" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-8 px-6 py-8 md:px-12 md:py-10">
        {/* TOPO: identidade institucional + relógio */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-secondary/40 bg-white/5"
            >
              <NetworkGraphic className="h-5 w-5" />
            </span>
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70 md:text-xs">
              SudoExpo 2026 · ACIRV
            </p>
          </div>
          <div
            data-testid="public-clock"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#6f7bff]/50 bg-[#0b1252]/70 px-4 py-2 shadow-[0_0_24px_rgba(111,123,255,0.25)] backdrop-blur"
          >
            <Clock aria-hidden className="h-4 w-4 text-success" />
            <span className="font-display text-base font-semibold tabular-nums tracking-wider text-white md:text-lg">
              {now ?? "--:--:--"}
            </span>
          </div>
        </header>

        {/* TÍTULO */}
        <div className="text-center md:text-left">
          <h1 className="font-display text-4xl font-black leading-[1.05] md:text-6xl xl:text-7xl">
            Matchmaker em tempo real
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-white/70 md:mx-0 md:text-lg">
            Conectando pessoas, ideias e oportunidades durante a SudoExpo.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75 backdrop-blur md:text-[11px]">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_var(--success)]" />
            Dados atualizados em tempo real
          </span>
        </div>

        {/* ÁREA PRINCIPAL: 4 métricas reais */}
        <div className="grid flex-1 content-center gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
          {metrics.map((m) => (
            <MetricCard key={m.key} label={m.label} icon={m.icon} tone={m.tone} value={m.value} />
          ))}
        </div>

        {/* RODAPÉ VISUAL (sem box) */}
        <footer className="text-center">
          <p className="font-display text-xl font-semibold md:text-3xl">
            <span className="text-white">Aqui, ninguém cresce isolado.</span>{" "}
            <span className="text-secondary">A gente cresce</span>{" "}
            <span className="text-success">conectado.</span>
          </p>
          <span
            aria-hidden
            className="mx-auto mt-2 block h-px w-40 bg-gradient-to-r from-transparent via-success to-transparent opacity-80"
          />
        </footer>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  icon: Icon,
  tone,
  value,
}: {
  label: string;
  icon: typeof Users;
  tone: Tone;
  value: string | null;
}) {
  const t = TONES[tone];
  return (
    <section
      aria-label={label}
      data-testid={`metric-card-${label}`}
      className={`relative overflow-hidden rounded-3xl border ${t.ring} bg-white/[0.04] p-5 backdrop-blur md:p-7`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: t.glow }} />
      {/* símbolo gráfico abstrato, quase transparente */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 opacity-[0.10] md:h-40 md:w-40"
      >
        <circle cx="30" cy="70" r="10" fill={t.accent} />
        <circle cx="72" cy="34" r="16" fill="none" stroke={t.accent} strokeWidth="4" />
        <path d="M32 66 L68 40" stroke={t.accent} strokeWidth="4" />
      </svg>

      <div className="relative">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${t.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70 md:text-xs">
          {label}
        </p>
        <span
          aria-hidden
          className="mt-2 block h-[3px] w-10 rounded-full"
          style={{ background: t.accent }}
        />
        {value === null ? (
          <div
            data-testid={`metric-skeleton-${label}`}
            aria-label={`${label}: carregando`}
            className="mt-3 h-[52px] w-24 animate-pulse rounded-2xl bg-white/10 md:h-[76px] md:w-36"
          />
        ) : (
          <p
            data-testid={`metric-value-${label}`}
            className="mt-3 font-display text-5xl font-black leading-none tabular-nums md:text-7xl xl:text-8xl"
          >
            {value}
          </p>
        )}
      </div>
    </section>
  );
}
