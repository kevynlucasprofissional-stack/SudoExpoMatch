import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OUTCOME_LABEL } from "@/features/staff/outcomes";
import {
  conversionRate,
  outcomeRows,
  useExperienceAnalytics,
  type ExperienceAnalytics,
} from "@/features/admin/useExperienceAnalytics";

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ExperienceAnalyticsCard({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const q = useExperienceAnalytics(eventId, enabled);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Experiência e resultados</h2>
          <p className="text-xs text-muted-foreground">
            Funil agregado no servidor. Sem dados pessoais.
          </p>
        </div>
        {q.isFetching && <Badge variant="outline">atualizando…</Badge>}
      </div>

      {q.isPending && <Skeleton className="mt-4 h-40 w-full" />}
      {q.isError && (
        <p className="mt-4 text-sm text-destructive">Não foi possível carregar as métricas.</p>
      )}

      {q.data && <AnalyticsBody data={q.data} />}
    </Card>
  );
}

function AnalyticsBody({ data }: { data: ExperienceAnalytics }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Cadastros" value={data.profiles_total} />
        <Metric
          label="Onboarding concluído"
          value={data.onboarding_completed}
          hint={`${conversionRate(data.onboarding_completed, data.profiles_total)}% dos cadastros`}
        />
        <Metric
          label="Com match"
          value={data.profiles_with_match}
          hint={`${data.matches_total} matches ativos`}
        />
        <Metric label="Interesses" value={data.interests} />
        <Metric label="Interesses mútuos" value={data.mutual_interests} />
        <Metric label="Conexões" value={data.connections_total} />
        <Metric
          label="Apresentações"
          value={data.connections_presented}
          hint={`${conversionRate(data.connections_presented, data.connections_total)}% das conexões`}
        />
        <Metric
          label="Conclusões"
          value={data.connections_completed}
          hint={`${data.connections_mapped} no mapa físico`}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Resultados comerciais</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {outcomeRows(data).map((row) => (
            <Metric key={row.kind} label={OUTCOME_LABEL[row.kind]} value={row.total} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.connections_with_outcome} conexão(ões) com algum resultado registrado —{" "}
          {data.outcomes_total} registro(s) no total.
        </p>
      </div>

      {Object.keys(data.product_events).length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Eventos de produto</h3>
          <ul className="flex flex-wrap gap-2">
            {Object.entries(data.product_events).map(([kind, total]) => (
              <li key={kind}>
                <Badge variant="outline" className="font-normal">
                  {kind}: {total}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
