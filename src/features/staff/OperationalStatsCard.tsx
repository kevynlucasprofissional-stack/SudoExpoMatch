import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOperationalStats, formatDurationSeconds } from "@/features/staff/useOperationalStats";
import { CONNECTION_STATUS_LABEL } from "@/features/connections/domain";
import type { ConnectionStatus } from "@/lib/types";

export function OperationalStatsCard({ eventId }: { eventId: string }) {
  const q = useOperationalStats(eventId, true);
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Não foi possível carregar os indicadores operacionais.
      </Card>
    );
  }
  const s = q.data!;
  return (
    <Card className="p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Indicadores operacionais</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Perfis" value={s.active_profiles} />
        <Kpi label="Matches ativos" value={s.total_matches} />
        <Kpi label="Mútuos" value={s.mutual_matches} />
        <Kpi label="Livres" value={s.unassigned} />
        <Kpi label="Apresentados" value={`${s.rate_presented.toFixed(1)}%`} />
        <Kpi label="Contato trocado" value={`${s.rate_contact_exchanged.toFixed(1)}%`} />
        <Kpi label="Concluídas" value={`${s.rate_completed.toFixed(1)}%`} />
        <Kpi label="Cancelamentos" value={s.cancellations} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Tempo médio p/ assumir"
          value={formatDurationSeconds(s.avg_seconds_to_assume)}
        />
        <Kpi
          label="Tempo médio p/ apresentar"
          value={formatDurationSeconds(s.avg_seconds_to_present)}
        />
        <Kpi
          label="Tempo médio p/ concluir"
          value={formatDurationSeconds(s.avg_seconds_to_complete)}
        />
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Por status</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(CONNECTION_STATUS_LABEL) as ConnectionStatus[]).map((st) => (
            <span key={st} className="rounded-full border border-border/60 bg-muted/40 px-2 py-1">
              {CONNECTION_STATUS_LABEL[st]}: <strong>{s.by_status[st] ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>

      {s.by_operator.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Carga por operador</h3>
          <ul className="divide-y rounded-md border">
            {s.by_operator.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between p-3 text-sm">
                <span>{o.email ?? o.user_id.slice(0, 8)}</span>
                <span className="text-xs text-muted-foreground">
                  {o.active} ativas · {o.completed} concluídas · {o.total} total
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function OperationalStatsSection({ eventId }: { eventId: string }) {
  return (
    <PageShell>
      <OperationalStatsCard eventId={eventId} />
    </PageShell>
  );
}
