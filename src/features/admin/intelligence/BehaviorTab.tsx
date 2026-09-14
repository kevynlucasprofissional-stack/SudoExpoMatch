import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PERMISSIVE_STRONG_MIN_DECISIONS,
  type IntelligenceBehavior,
} from "@/features/admin/intelligenceSchemas";
import {
  behaviorRanking,
  behaviorScatterPoints,
  cohortBadge,
  propensityRows,
} from "@/features/admin/intelligencePresentation";
import { EmptyBlock, KpiCard, SectionTitle } from "./KpiCard";

export function BehaviorTab({
  data,
  isPending,
}: {
  data?: IntelligenceBehavior;
  isPending: boolean;
}) {
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyBlock message="Sem dados para este evento." />;

  const hist = propensityRows(data);
  const points = behaviorScatterPoints(data);
  const ranking = behaviorRanking(data);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Participantes com decisão"
          value={data.participants_with_decision}
          hint={`${data.decisions_total} decisões registradas`}
          description="Somente quem registrou interesse ou 'agora não'. Quem não decidiu não entra em nenhuma taxa."
        />
        <KpiCard
          label="Seletivos"
          value={data.selective}
          description="Tem ao menos um interesse e ao menos um 'agora não'. Coorte de referência para avaliar o matcher."
        />
        <KpiCard
          label="Permissivos fortes"
          value={data.permissive_strong}
          description={`≥ ${PERMISSIVE_STRONG_MIN_DECISIONS} decisões e 100% interesse. Aceitam quase tudo — inflam taxas globais.`}
          tone="warning"
        />
        <KpiCard
          label="100% interesse (pouca amostra)"
          value={data.all_interest_small_sample}
          description={`Menos de ${PERMISSIVE_STRONG_MIN_DECISIONS} decisões, todas interesse. Não devem ser lidos como permissivos.`}
        />
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Distribuição da propensão a interesse"
          subtitle="Interesses ÷ decisões registradas, por participante."
        />
        {data.participants_with_decision === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="Nenhuma decisão registrada neste evento." />
          </div>
        ) : (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof hist)[number];
                    return (
                      <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-md">
                        <p className="font-medium">Propensão {p.bucket}</p>
                        <p className="mt-1 text-muted-foreground">
                          {p.participants} participante(s) · {p.decisions} decisões
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="participants"
                  name="Participantes"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={56}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Propensão × score médio aceito"
          subtitle="Cada ponto é um participante com pelo menos um interesse. Tamanho do ponto = volume de decisões."
        />
        {points.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="Sem interesses registrados para montar o gráfico." />
          </div>
        ) : (
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Propensão"
                  unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Score médio aceito"
                  tick={{ fontSize: 12 }}
                  stroke="var(--muted-foreground)"
                />
                <ZAxis type="number" dataKey="decisions" range={[40, 320]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof points)[number];
                    return (
                      <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-md">
                        <p className="font-medium">{p.name}</p>
                        {p.company && <p className="text-muted-foreground">{p.company}</p>}
                        <p className="mt-1 text-muted-foreground">
                          propensão {p.x.toFixed(1)}% · score médio aceito {p.y.toFixed(1)} ·{" "}
                          {p.decisions} decisões
                        </p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  name="Seletivos"
                  data={points.filter((p) => p.selective)}
                  fill="var(--chart-3)"
                  fillOpacity={0.85}
                />
                <Scatter
                  name="Permissivos fortes"
                  data={points.filter((p) => p.permissiveStrong)}
                  fill="var(--destructive)"
                  fillOpacity={0.7}
                />
                <Scatter
                  name="Outros"
                  data={points.filter((p) => !p.selective && !p.permissiveStrong)}
                  fill="var(--chart-1)"
                  fillOpacity={0.55}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Maiores decisores do evento"
          subtitle="Ordenado por volume de decisões — quem mais influencia as taxas globais."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2">Participante</th>
                <th className="py-2">Coorte</th>
                <th className="py-2 text-right">Decisões</th>
                <th className="py-2 text-right">Interesses</th>
                <th className="py-2 text-right">Propensão</th>
                <th className="py-2 text-right">Score médio aceito</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((p) => {
                const badge = cohortBadge(p);
                return (
                  <tr key={p.profile_id} className="border-b border-border/50">
                    <td className="py-2">
                      <span className="font-medium">{p.name}</span>
                      {p.company && (
                        <span className="block text-xs text-muted-foreground">{p.company}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {badge.tone === "neutral" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {badge.label}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.decisions}</td>
                    <td className="py-2 text-right tabular-nums">{p.interests}</td>
                    <td className="py-2 text-right tabular-nums">{p.propensity_pct.toFixed(1)}%</td>
                    <td className="py-2 text-right tabular-nums">
                      {p.avg_accepted_score === null ? "—" : p.avg_accepted_score.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
