import { Link } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MatchGraph } from "@/features/admin/graphSchemas";
import { INTEREST_COLOR, INTEREST_LABEL } from "@/features/admin/graphPresentation";
import { networkSummary } from "@/features/admin/intelligencePresentation";
import { EmptyBlock, KpiCard, SectionTitle } from "./KpiCard";

/**
 * IMPL 29 — a Rede NÃO recria o canvas. Reaproveita o payload já usado por
 * /admin/graph (`useAdminMatchGraph`) para dar um resumo agregado e mandar o
 * usuário explorar no mapa existente.
 */
export function NetworkTab({ data, isPending }: { data?: MatchGraph; isPending: boolean }) {
  if (isPending) return <Skeleton className="h-80 w-full" />;
  if (!data) return <EmptyBlock message="Sem dados de rede para este evento." />;

  const s = networkSummary(data);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle
          title="Mapa Vivo de Conexões"
          subtitle="Resumo agregado da mesma rede desenhada no mapa de conexões."
          right={
            <Button asChild size="sm">
              <Link to="/admin/graph">
                <Network className="mr-1 h-4 w-4" /> Explorar grafo completo
              </Link>
            </Button>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Participantes na rede"
            value={s.nodes}
            hint={`${s.isolated} sem nenhuma dupla`}
            description="Nós do grafo: perfis do evento selecionado."
          />
          <KpiCard
            label="Duplas ativas"
            value={s.edges}
            description="Arestas do grafo: matches ativos do evento."
          />
          <KpiCard
            label="Grau médio"
            value={s.avgDegree.toFixed(1)}
            hint={`maior grau: ${s.maxDegree}`}
            description="Média de duplas por participante. Grau alto indica hub natural da rede."
          />
          <KpiCard
            label="Conexões operacionais"
            value={s.withConnection}
            description="Duplas que já têm uma conexão registrada pela equipe."
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["mutual", "single", "none", "declined"] as const).map((state) => (
            <div
              key={state}
              className="rounded-xl border border-border/60 bg-muted/25 p-4"
              style={{ borderLeft: `4px solid ${INTEREST_COLOR[state]}` }}
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {INTEREST_LABEL[state]}
              </p>
              <p className="mt-1.5 font-display text-2xl font-semibold leading-none">
                {s.states[state]}
              </p>
            </div>
          ))}
        </div>

        {s.topHubs.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-medium">Maiores hubs</h3>
            <ul className="mt-2 divide-y divide-border/50 text-sm">
              {s.topHubs.map((h) => (
                <li key={h.profile_id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-medium">{h.name}</span>
                    {h.company && (
                      <span className="block text-xs text-muted-foreground">{h.company}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{h.degree} duplas</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
          Próxima fase da leitura de rede: <strong>hubs</strong> (quem concentra oportunidades),{" "}
          <strong>pontes</strong> (quem conecta segmentos que não se falam), <strong>clusters</strong>{" "}
          (comunidades naturais de negócio) e <strong>isolados</strong> (quem precisa de curadoria
          manual). Centralidade e detecção de comunidade exigem cálculo dedicado e não são
          estimadas no navegador nesta versão.
        </p>
      </Card>
    </div>
  );
}
