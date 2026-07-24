import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { store, useStoreSelector } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Connection, ConnectionStatus } from "@/lib/types";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Fila da equipe — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Dashboard e fila de atendimento para a equipe ACIRV do Matchmaker SudoExpo.",
      },
    ],
  }),
  component: StaffQueue,
});

const NEXT_STATUS: Record<ConnectionStatus, ConnectionStatus | null> = {
  aguardando: "em_atendimento",
  em_atendimento: "apresentados",
  apresentados: "contato_trocado",
  contato_trocado: "concluido",
  concluido: null,
  cancelado: null,
};

const LABELS: Record<ConnectionStatus, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  apresentados: "Apresentados",
  contato_trocado: "Contato trocado",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

function StaffQueue() {
  const view = useStoreSelector(() => {
    const snap = store.all();
    return {
      stats: store.stats(),
      conns: [...snap.connections].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
      byId: new Map(snap.profiles.map((p) => [p.id, p])),
    };
  });
  const { stats, conns, byId } = view;


  async function advance(c: Connection) {
    const next = NEXT_STATUS[c.status];
    if (!next) return;
    const { error } = await supabase
      .from("connections")
      .update({ status: next })
      .eq("id", c.id);
    if (error) toast.error("Não foi possível atualizar (requer login de equipe).");
    else toast.success(`Status: ${LABELS[next]}`);
  }
  async function cancel(c: Connection) {
    const { error } = await supabase
      .from("connections")
      .update({ status: "cancelado" })
      .eq("id", c.id);
    if (error) toast.error("Ação restrita à equipe autenticada.");
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-6">
          <h1 className="font-display text-3xl font-bold">Fila da equipe</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe conexões mútuas e conduza o atendimento presencial.
          </p>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Perfis" value={stats.profiles} />
          <Stat label="Matches" value={stats.matches} />
          <Stat label="Mútuos" value={stats.mutualMatches} />
          <Stat label="Concluídas" value={stats.completedConnections} />
        </div>

        {conns.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Ainda não há conexões mútuas. Assim que dois participantes marcarem
            interesse recíproco, aparecerão aqui em tempo real.
          </Card>
        ) : (
          <ul className="space-y-3">
            {conns.map((c) => {
              const a = byId.get(c.aProfileId);
              const b = byId.get(c.bProfileId);
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{LABELS[c.status]}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="mt-2 font-medium">
                        {a?.name ?? "?"} · {a?.company ?? ""}{" "}
                        <span className="text-muted-foreground">↔</span>{" "}
                        {b?.name ?? "?"} · {b?.company ?? ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a?.city} · {b?.city}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {NEXT_STATUS[c.status] && (
                        <Button size="sm" onClick={() => advance(c)}>
                          Avançar → {LABELS[NEXT_STATUS[c.status]!]}
                        </Button>
                      )}
                      {c.status !== "concluido" && c.status !== "cancelado" && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(c)}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Escritas nesta tela exigem login de equipe (papel <code>staff</code> ou{" "}
          <code>admin</code>). Sem sessão autenticada, as ações são bloqueadas
          pelo RLS do banco.
        </p>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
