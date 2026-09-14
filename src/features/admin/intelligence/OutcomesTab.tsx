import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { OUTCOME_KINDS, OUTCOME_LABEL } from "@/features/staff/outcomes";
import type { IntelligenceOverview } from "@/features/admin/intelligenceSchemas";
import {
  SNAPSHOT_DRIFT_DESCRIPTION,
  formatRate,
  groundTruthStatus,
  outcomesCoverage,
  snapshotDrift,
  taxonomyCoverage,
} from "@/features/admin/intelligencePresentation";
import { EmptyBlock, KpiCard, RateKpi, SectionTitle } from "./KpiCard";

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  apresentados: "Apresentados",
  contato_trocado: "Contato trocado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export function OutcomesTab({
  data,
  isPending,
}: {
  data?: IntelligenceOverview;
  isPending: boolean;
}) {
  if (isPending) return <Skeleton className="h-80 w-full" />;
  if (!data) return <EmptyBlock message="Sem dados para este evento." />;

  const gt = groundTruthStatus(data);
  const cov = outcomesCoverage(data);
  const drift = snapshotDrift(data);
  const tax = taxonomyCoverage(data);
  const statuses = Object.entries(data.connections.by_status).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <Card
        className={
          gt.sufficient
            ? "border-emerald-500/40 bg-emerald-500/5 p-5"
            : "border-destructive/40 bg-destructive/5 p-5"
        }
      >
        <h2 className="font-display text-base font-semibold">
          {gt.sufficient ? "Ground truth utilizável" : "Ground truth ainda insuficiente"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{gt.message}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{data.connections.total} conexões no sistema</Badge>
          <Badge variant="outline">{data.connections.offline} registradas fora do sistema</Badge>
          <Badge variant="outline">{data.outcomes.total} resultados fortes</Badge>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            title="Conexões por situação atual"
            subtitle="Situação operacional registrada pela equipe."
          />
          {statuses.length === 0 ? (
            <div className="mt-4">
              <EmptyBlock message="Nenhuma conexão registrada." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {statuses.map(([status, count]) => (
                <div key={status}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{STATUS_LABEL[status] ?? status}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <Progress
                    value={
                      data.connections.total > 0 ? (count / data.connections.total) * 100 : 0
                    }
                    className="mt-1.5 h-2"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Conexão concluída mede execução operacional, não valor comercial gerado.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Resultados comerciais fortes"
            subtitle="Registrados pela equipe na fila de conexões."
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {OUTCOME_KINDS.map((kind) => (
              <div key={kind} className="rounded-lg border border-border/60 bg-muted/25 p-3">
                <p className="text-xs text-muted-foreground">{OUTCOME_LABEL[kind]}</p>
                <p className="mt-1 font-display text-xl font-semibold">
                  {data.outcomes.by_kind[kind] ?? 0}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span>Cobertura de resultados</span>
              <span className="tabular-nums text-muted-foreground">
                {formatRate(cov)} ({cov.numerator}/{cov.denominator})
              </span>
            </div>
            <Progress value={cov.pct ?? 0} className="mt-1.5 h-2" />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Data Trust"
          subtitle="O que pode contaminar qualquer leitura deste painel."
        />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RateKpi
            label="Snapshot drift"
            r={drift}
            description={SNAPSHOT_DRIFT_DESCRIPTION}
            tone={(drift.pct ?? 0) > 20 ? "warning" : "default"}
          />
          <RateKpi
            label="Cobertura — necessidades"
            r={tax.needs}
            description="Necessidades ativas com item canônico."
          />
          <RateKpi
            label="Cobertura — ofertas"
            r={tax.offers}
            description="Ofertas ativas com item canônico."
          />
          <KpiCard
            label="Origem das decisões"
            value="Participante"
            description="Todas as decisões de interesse deste modelo são registradas pelo próprio participante. Ações administrativas em lote ficam em conexões, não em decisões."
          />
        </div>
        <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-muted-foreground">
          <li>
            Métricas históricas podem estar contaminadas por recomputações do matcher: o score e as
            razões exibidos hoje são o snapshot atual, não necessariamente o que a pessoa viu ao
            decidir.
          </li>
          <li>
            Itens em texto livre não participam de relações complementares — cobertura baixa reduz
            sinal do matcher antes de qualquer ajuste de peso.
          </li>
          <li>
            Sem resultados comerciais registrados, nenhuma conclusão sobre qualidade final do match
            é sustentável — só sobre comportamento de decisão.
          </li>
        </ul>
      </Card>
    </div>
  );
}
