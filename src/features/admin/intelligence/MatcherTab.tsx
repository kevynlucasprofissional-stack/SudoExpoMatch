import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOW_SCORE_MAX, type IntelligenceMatcher } from "@/features/admin/intelligenceSchemas";
import {
  BUCKET_LABEL,
  MATRIX_METRIC_LABEL,
  REASON_LIFT_DISCLAIMER,
  formatPp,
  formatRate,
  kindRows,
  reasonLiftRows,
  scoreMatrix,
  type MatrixMetric,
  type ReasonCohort,
  type ScoreBucketKey,
} from "@/features/admin/intelligencePresentation";
import { EmptyBlock, KpiCard, SectionTitle } from "./KpiCard";

export function MatcherTab({
  data,
  isPending,
}: {
  data?: IntelligenceMatcher;
  isPending: boolean;
}) {
  const [metric, setMetric] = useState<MatrixMetric>("matches");
  const [cohort, setCohort] = useState<ReasonCohort>("all");

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyBlock message="Sem dados para este evento." />;

  const grid = scoreMatrix(data, metric);
  const lift = reasonLiftRows(data, cohort);
  const kinds = kindRows(data);
  const res = data.residuals;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle
          title="Matriz score A × score B"
          subtitle="Como o matcher distribui as duas perspectivas da mesma dupla. Assimetria alta significa dupla interessante para um lado só."
          right={
            <Select value={metric} onValueChange={(v) => setMetric(v as MatrixMetric)}>
              <SelectTrigger className="h-8 w-48 text-xs" aria-label="Métrica da matriz">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MATRIX_METRIC_LABEL) as MatrixMetric[]).map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {MATRIX_METRIC_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {grid.max === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="Nenhum match ativo para montar a matriz." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="w-24 text-left font-normal text-muted-foreground">
                    A ↓ / B →
                  </th>
                  {grid.buckets.map((b) => (
                    <th key={b} className="font-medium text-muted-foreground">
                      {BUCKET_LABEL[b as ScoreBucketKey]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.buckets.map((rowBucket) => (
                  <tr key={rowBucket}>
                    <th className="text-left font-medium text-muted-foreground">
                      {BUCKET_LABEL[rowBucket as ScoreBucketKey]}
                    </th>
                    {grid.buckets.map((colBucket) => {
                      const cell = grid.cells.find(
                        (c) => c.bucketA === rowBucket && c.bucketB === colBucket,
                      )!;
                      return (
                        <td
                          key={colBucket}
                          className="rounded-md py-2 tabular-nums"
                          style={{
                            background: `color-mix(in oklab, var(--chart-1) ${Math.round(
                              cell.intensity * 85,
                            )}%, var(--muted))`,
                            color: cell.intensity > 0.55 ? "var(--primary-foreground)" : undefined,
                          }}
                          title={`A ${rowBucket} × B ${colBucket}: ${cell.matches} matches, ${cell.mutual} mútuos, ${cell.connections} com conexão`}
                        >
                          {cell.value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Reason Lift"
          subtitle="Diferença de taxa de interesse entre decisões que tinham e que não tinham cada sinal."
          right={
            <Select value={cohort} onValueChange={(v) => setCohort(v as ReasonCohort)}>
              <SelectTrigger className="h-8 w-40 text-xs" aria-label="Coorte do reason lift">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos
                </SelectItem>
                <SelectItem value="selective" className="text-xs">
                  Seletivos
                </SelectItem>
              </SelectContent>
            </Select>
          }
        />
        {lift.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="Sem decisões suficientes para calcular lift." />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {lift.map((row) => {
              const width = Math.min(100, Math.abs(row.liftPp ?? 0) * 2.5);
              const positive = (row.liftPp ?? 0) >= 0;
              return (
                <li key={row.code} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="flex items-center gap-2">
                      {row.smallSample && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/50 text-[10px] font-normal"
                        >
                          <TriangleAlert className="h-3 w-3" /> amostra pequena
                        </Badge>
                      )}
                      <span
                        className={
                          positive
                            ? "text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                            : "text-sm font-semibold tabular-nums text-destructive"
                        }
                      >
                        {formatPp(row.liftPp)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${width}%`,
                        background: positive ? "var(--chart-4)" : "var(--destructive)",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    com sinal: {formatRate(row.withRate)} ({row.withRate.numerator}/
                    {row.withRate.denominator}) · sem sinal: {formatRate(row.withoutRate)} (
                    {row.withoutRate.numerator}/{row.withoutRate.denominator})
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{REASON_LIFT_DISCLAIMER}</p>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Efetividade por tipo de match"
          subtitle="Tipos reais gerados pelo matcher neste evento."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2">Tipo</th>
                <th className="py-2 text-right">Matches</th>
                <th className="py-2 text-right">Decisões</th>
                <th className="py-2 text-right">Interesse (todos)</th>
                <th className="py-2 text-right">Interesse (seletivos)</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k.kind} className="border-b border-border/50">
                  <td className="py-2">{k.label}</td>
                  <td className="py-2 text-right tabular-nums">{k.matches}</td>
                  <td className="py-2 text-right tabular-nums">{k.decisions}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatRate(k.all)}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({k.all.numerator}/{k.all.denominator})
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatRate(k.selective)}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({k.selective.numerator}/{k.selective.denominator})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title={`Residuais de score baixo (< ${LOW_SCORE_MAX})`}
          subtitle="Interesses de participantes seletivos em duplas de score baixo. Cada linha é uma pista de sinal que o matcher ainda não captura."
          right={
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/matches" search={{ max: LOW_SCORE_MAX - 1 }}>
                Investigar em Matches <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Interesses residuais"
            value={res.total}
            description="Interesse de participante seletivo em dupla com score da própria perspectiva abaixo de 40."
          />
          <KpiCard
            label="Com interesse mútuo"
            value={res.mutual}
            description="Residuais que viraram interesse dos dois lados."
          />
          <KpiCard
            label="Com conexão"
            value={res.with_connection}
            description="Residuais que geraram uma conexão operacional."
          />
          <KpiCard
            label="Com resultado forte"
            value={res.with_strong_outcome}
            description="Residuais com resultado comercial forte registrado. Zero significa ausência de telemetria, não ausência de valor."
          />
        </div>

        {res.sample.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="Nenhum residual identificado." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">Participante</th>
                  <th className="py-2">Empresa</th>
                  <th className="py-2 text-right">Score</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {res.sample.map((r) => (
                  <tr key={`${r.match_id}-${r.profile_id}`} className="border-b border-border/50">
                    <td className="py-2">{r.profile_name}</td>
                    <td className="py-2 text-muted-foreground">{r.company || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{r.score}</td>
                    <td className="py-2 text-muted-foreground">{r.kind}</td>
                    <td className="py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.mutual && (
                          <Badge variant="outline" className="text-[10px]">
                            mútuo
                          </Badge>
                        )}
                        {r.connection_status && (
                          <Badge variant="outline" className="text-[10px]">
                            {r.connection_status}
                          </Badge>
                        )}
                        {r.strong_outcome && (
                          <Badge className="text-[10px]">resultado forte</Badge>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
