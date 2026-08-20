import { createFileRoute } from "@tanstack/react-router";
import { memo, useEffect, useState } from "react";
import { Clock, HeartHandshake, Sparkles, Users, Handshake } from "lucide-react";

import { EVENT_ID } from "@/config/event";
import { ConnectionScene } from "@/components/public/ConnectionScene";
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

const TONES: Record<
  Tone,
  { hex: string; border: string; wash: string; shadow: string; iconBg: string }
> = {
  cyan: {
    hex: "#22d3ee",
    border: "rgba(34,211,238,0.38)",
    wash: "linear-gradient(160deg, rgba(34,211,238,0.30) 0%, rgba(9,20,68,0.30) 46%, rgba(3,9,44,0.55) 100%)",
    shadow: "0 24px 70px -28px rgba(34,211,238,0.55), inset 0 -60px 90px -70px rgba(34,211,238,0.9)",
    iconBg: "rgba(34,211,238,0.16)",
  },
  violet: {
    hex: "#8f9bff",
    border: "rgba(143,155,255,0.40)",
    wash: "linear-gradient(160deg, rgba(143,155,255,0.32) 0%, rgba(11,18,82,0.32) 46%, rgba(3,9,44,0.55) 100%)",
    shadow:
      "0 24px 70px -28px rgba(143,155,255,0.55), inset 0 -60px 90px -70px rgba(143,155,255,0.9)",
    iconBg: "rgba(143,155,255,0.18)",
  },
  lime: {
    hex: "#a3e635",
    border: "rgba(163,230,53,0.38)",
    wash: "linear-gradient(160deg, rgba(163,230,53,0.26) 0%, rgba(9,26,44,0.32) 46%, rgba(3,9,44,0.55) 100%)",
    shadow: "0 24px 70px -28px rgba(163,230,53,0.45), inset 0 -60px 90px -70px rgba(163,230,53,0.8)",
    iconBg: "rgba(163,230,53,0.16)",
  },
  orange: {
    hex: "#ff8a3d",
    border: "rgba(255,138,61,0.38)",
    wash: "linear-gradient(160deg, rgba(255,138,61,0.30) 0%, rgba(30,16,48,0.32) 46%, rgba(3,9,44,0.55) 100%)",
    shadow: "0 24px 70px -28px rgba(255,138,61,0.50), inset 0 -60px 90px -70px rgba(255,138,61,0.85)",
    iconBg: "rgba(255,138,61,0.16)",
  },
};

/** Relógio isolado/memoizado: o tick de 1s não re-renderiza o painel inteiro. */
const BoardClock = memo(function BoardClock() {
  // 100% local, montado só após hidratação (sem mismatch, sem backend).
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      data-testid="public-clock"
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#6f7bff]/55 bg-[#0a1150]/60 px-3.5 py-2 shadow-[0_0_38px_-10px_rgba(111,123,255,0.85)] backdrop-blur sm:gap-3 sm:px-5 sm:py-2.5 xl:px-7 xl:py-3"
    >
      <Clock aria-hidden className="h-4 w-4 text-[#a3e635] sm:h-5 sm:w-5" />
      <span className="font-display text-base font-semibold tabular-nums tracking-[0.12em] text-white sm:text-xl xl:text-3xl">
        {now ?? "--:--:--"}
      </span>
    </div>
  );
});

function PublicBoard() {
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#02072a] text-white xl:h-screen xl:overflow-hidden">
      {/* Fundo: marinho profundo + gradientes radiais azul/violeta/ciano */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 12% 4%, rgba(4,17,74,0.95) 0%, transparent 62%)," +
            "radial-gradient(60% 50% at 88% 6%, rgba(90,60,190,0.30) 0%, transparent 64%)," +
            "radial-gradient(55% 45% at 96% 78%, rgba(34,211,238,0.14) 0%, transparent 66%)," +
            "radial-gradient(85% 60% at 45% 112%, rgba(3,11,58,0.98) 0%, transparent 70%)",
        }}
      />
      {/* Rede de conexões (atrás dos cards) */}
      <ConnectionScene className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(80% 60% at 50% 55%, rgba(2,7,42,0.55) 0%, transparent 75%)" }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1720px] xl:h-screen xl:min-h-0 flex-col px-6 py-7 sm:px-10 xl:px-20 xl:py-12">
        {/* TOPO: identidade institucional + relógio */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-secondary/40 bg-white/[0.06] shadow-[0_0_28px_-8px_rgba(34,211,238,0.7)]"
            >
              <NetworkGraphic className="h-5 w-5" />
            </span>
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.42em] text-white/60 xl:text-[13px]">
              SudoExpo 2026 · ACIRV
            </p>
          </div>
          <BoardClock />
        </header>

        {/* TÍTULO */}
        <div className="mt-8 xl:mt-12">
          <h1 className="font-display text-4xl font-black leading-[1.02] tracking-tight md:text-6xl xl:text-[5.2rem]">
            Matchmaker em tempo real
          </h1>
          <p className="mt-4 max-w-4xl text-base text-[#b9c6ee] md:text-xl xl:text-2xl">
            Conectando pessoas, ideias e oportunidades durante a SudoExpo.
          </p>
          <span className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-[#3a5bd9]/50 bg-white/[0.04] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#c9d6f5] backdrop-blur xl:text-[11px]">
            <span
              aria-hidden
              className="pb-status-dot h-2 w-2 rounded-full bg-[#a3e635]"
            />
            Dados atualizados em tempo real
          </span>
        </div>

        {/* ÁREA PRINCIPAL: 4 métricas reais */}
        <div className="mt-6 mb-8 grid sm:mt-8 sm:mb-12 flex-1 content-center gap-4 sm:grid-cols-2 sm:gap-5 xl:mt-10 xl:mb-16 xl:grid-cols-4 xl:gap-8">
          {metrics.map((m, i) => (
            <MetricCard
              key={m.key}
              label={m.label}
              icon={m.icon}
              tone={m.tone}
              value={m.value}
              index={i}
            />
          ))}
        </div>

        {/* RODAPÉ VISUAL (sem box) */}
        <footer className="pb-3 pt-2 text-center">
          <p className="font-display text-2xl font-bold tracking-tight md:text-4xl xl:text-[2.6rem]">
            <span className="text-white">Aqui, ninguém cresce isolado.</span>{" "}
            <span className="text-[#4aa8ff]">A gente cresce</span>{" "}
            <span className="text-[#a3e635]">conectado.</span>
          </p>
          <span
            aria-hidden
            className="mx-auto mt-3 block h-[2px] w-56 rounded-full bg-linear-to-r from-transparent via-[#4aa8ff] to-[#a3e635] opacity-90 shadow-[0_0_16px_rgba(74,168,255,0.6)]"
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
  index,
}: {
  label: string;
  icon: typeof Users;
  tone: Tone;
  value: string | null;
  index: number;
}) {
  const t = TONES[tone];
  return (
    <section
      aria-label={label}
      data-testid={`metric-card-${label}`}
      className="pb-card-glow relative flex min-h-[210px] flex-col overflow-hidden rounded-[28px] border p-5 backdrop-blur-md sm:min-h-[215px] sm:p-6 xl:min-h-[320px] xl:p-8"
      style={{
        borderColor: t.border,
        background: t.wash,
        boxShadow: t.shadow,
        ["--pb-dur" as string]: `${5 + index}s`,
        animationDelay: `${index * 0.9}s`,
      }}
    >
      {/* brilho inferior */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 bottom-0 h-[2px] rounded-full opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${t.hex}, transparent)` }}
      />
      {/* ícone decorativo grande, quase transparente */}
      <Icon
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -right-7 h-36 w-36 opacity-[0.08] xl:h-52 xl:w-52"
        style={{ color: t.hex }}
        strokeWidth={1}
      />

      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border xl:h-12 xl:w-12"
        style={{
          background: t.iconBg,
          borderColor: t.border,
          color: t.hex,
          boxShadow: `0 0 26px -6px ${t.hex}, inset 0 0 18px -10px ${t.hex}`,
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </span>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/75 xl:text-[13px]">
        {label}
      </p>
      <span
        aria-hidden
        className="mt-3 block h-[3px] w-12 rounded-full"
        style={{ background: t.hex, boxShadow: `0 0 14px ${t.hex}` }}
      />

      <div className="mt-auto pt-6">
        {value === null ? (
          <div
            data-testid={`metric-skeleton-${label}`}
            aria-label={`${label}: carregando`}
            className="h-[48px] w-24 animate-pulse sm:h-[56px] sm:w-28 rounded-2xl bg-white/10 xl:h-[92px] xl:w-44"
          />
        ) : (
          <p
            key={value}
            data-testid={`metric-value-${label}`}
            className="pb-value font-display text-5xl sm:text-6xl font-black leading-[0.85] tabular-nums text-white xl:text-8xl"
            style={{ textShadow: `0 0 42px ${t.hex}55` }}
          >
            {value}
          </p>
        )}
      </div>
    </section>
  );
}
