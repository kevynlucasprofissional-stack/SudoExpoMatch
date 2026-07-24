import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { store, useStoreSelector } from "@/lib/store";
import { EVENT_NAME } from "@/lib/mock-data";
import { HeartHandshake, Sparkles, Users, Handshake } from "lucide-react";
import { NetworkGraphic } from "@/components/brand/NetworkGraphic";

export const Route = createFileRoute("/publico")({
  head: () => ({
    meta: [
      { title: "Painel público — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Painel para TV/LED com estatísticas agregadas do Matchmaker SudoExpo.",
      },
    ],
  }),
  component: PublicBoard,
});

function PublicBoard() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const stats = useStoreSelector(() => store.stats());

  return (
    <div className="relative min-h-screen overflow-hidden bg-hero-gradient text-primary-foreground">
      <div className="absolute inset-0 opacity-30">
        <NetworkGraphic className="h-full w-full" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-between px-8 py-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/70">
              {EVENT_NAME} · ACIRV
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">
              Matchmaker em tempo real
            </h1>
          </div>
          <div className="rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur">
            {hydrated ? new Date().toLocaleTimeString("pt-BR") : "--:--:--"}
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-4">
          <StatCard
            icon={Users}
            label="Participantes"
            value={hydrated ? stats.profiles : 0}
            tone="secondary"
          />
          <StatCard
            icon={Sparkles}
            label="Matches gerados"
            value={hydrated ? stats.matches : 0}
            tone="accent"
          />
          <StatCard
            icon={HeartHandshake}
            label="Interesse mútuo"
            value={hydrated ? stats.mutualMatches : 0}
            tone="warning"
          />
          <StatCard
            icon={Handshake}
            label="Conexões concluídas"
            value={hydrated ? stats.completedConnections : 0}
            tone="success"
          />
        </div>


        <footer className="text-center">
          <p className="font-display text-2xl font-semibold md:text-3xl">
            Aqui, ninguém cresce isolado.{" "}
            <span className="text-gradient-brand">A gente cresce conectado.</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "secondary" | "accent" | "warning" | "success";
}) {
  const bg = {
    secondary: "bg-secondary/20 border-secondary/40",
    accent: "bg-accent/20 border-accent/40",
    warning: "bg-warning/20 border-warning/40",
    success: "bg-success/20 border-success/40",
  }[tone];
  return (
    <div
      className={`rounded-3xl border p-6 backdrop-blur ${bg}`}
      aria-label={label}
    >
      <Icon className="h-8 w-8 opacity-90" />
      <p className="mt-3 text-xs uppercase tracking-widest text-white/70">
        {label}
      </p>
      <p className="mt-1 font-display text-5xl font-bold tabular-nums md:text-6xl">
        {value}
      </p>
    </div>
  );
}
