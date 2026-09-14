import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HIGH_SCORE_MIN,
  LOW_SCORE_MAX,
  PERMISSIVE_STRONG_MIN_DECISIONS,
  type IntelligenceOverview,
} from "@/features/admin/intelligenceSchemas";
import {
  SIGNAL_GAP_DESCRIPTION,
  SNAPSHOT_DRIFT_DESCRIPTION,
  formatPp,
  formatRate,
  groundTruthStatus,
  interestRate,
  lowScoreComposition,
  lowScoreNoiseShare,
  outcomesCoverage,
  scoreBucketRows,
  selectiveSignalGap,
  snapshotDrift,
  taxonomyCoverage,
} from "@/features/admin/intelligencePresentation";
import { EmptyBlock, KpiCard, RateKpi, SectionTitle } from "./KpiCard";

const COMPOSITION_COLORS = ["var(--chart-3)", "var(--chart-1)", "var(--muted-foreground)"];

export function OverviewTab({
  data,
  isPending,
}: {
  data?: IntelligenceOverview;
  isPending: boolean;
}) {
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyBlock message="Sem dados para este evento." />;

  const ir = interestRate(data);
  const gap = selectiveSignalGap(data);
  const noise = lowScoreNoiseShare(data);
  const tax = taxonomyCoverage(data);
  const drift = snapshotDrift(data);
  const outCov = outcomesCoverage(data);
  const gt = groundTruthStatus(data);
  const buckets = scoreBucketRows(data);
  const composition = lowScoreComposition(data);
  const versions = Object.entries(data.algorithm_versions);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Participantes ativos"
          value={data.participants_active}
          description="Perfis reais do evento selecionado (exclui perfis de teste)."
        />
        <KpiCard
          label="Matches ativos"
          value={data.matches_active}
          hint={versions.map(([v, c]) => `${v}: ${c}`).join(" · ")}
          description="Duplas ativas geradas pelo matcher para este evento, por versão do algoritmo."
        />
        <KpiCard
          label="Decisões registradas"
          value={data.decisions_total}
          hint={`${data.participants_with_decision} participantes decidiram`}
          description="Somente interesse e agora não. 'Sem decisão' nunca entra em denominador nem conta como rejeição."
        />
        <RateKpi
          label="Taxa de interesse"
          r={ir}
          description="Interesses divididos pelas decisões registradas."
        />
        <KpiCard
          label="Selective Signal Gap"
          value={formatPp(gap.gapPp)}
          hint={`alto ${formatRate(gap.high)} (${gap.high.denominator}) · baixo ${formatRate(gap.low)} (${gap.low.denominator})`}
          description={SIGNAL_GAP_DESCRIPTION}
          tone={gap.gapPp !== null && gap.gapPp > 15 ? "positive" : "warning"}
          smallSample={gap.smallSample}
        />
        <RateKpi
          label="Ruído de score baixo"
          r={noise}
          description={`Interesses em score < ${LOW_SCORE_MAX} que vêm de participantes permissivos fortes (≥ ${PERMISSIVE_STRONG_MIN_DECISIONS} decisões, 100% interesse).`}
          tone={(noise.pct ?? 0) > 50 ? "warning" : "default"}
        />
        <RateKpi
          label="Cobertura taxonômica — necessidades"
          r={tax.needs}
          description="Necessidades ativas com item canônico da taxonomia."
        />
        <RateKpi
          label="Cobertura taxonômica — ofertas"
          r={tax.offers}
          description="Ofertas ativas com item canônico da taxonomia."
        />
        <RateKpi
          label="Snapshot drift"
          r={drift}
          description={SNAPSHOT_DRIFT_DESCRIPTION}
          tone={(drift.pct ?? 0) > 20 ? "warning" : "default"}
        />
        <RateKpi
          label="Cobertura de resultados"
          r={outCov}
          description="Conexões com pelo menos um resultado comercial forte registrado."
          tone={gt.sufficient ? "positive" : "danger"}
        />
        <KpiCard
          label="Participantes seletivos"
          value={data.selective_participants}
          hint={`${data.permissive_strong_participants} permissivos fortes`}
          description="Seletivo = tem ao menos um interesse e ao menos um 'agora não' no evento. É a coorte confiável para avaliar o matcher."
        />
        <KpiCard
          label="Matches com interesse mútuo"
          value={data.mutual_matches}
          hint={`${data.connections.total} conexões · ${data.connections.offline} fora do sistema`}
          description="Duplas em que os dois lados registraram interesse."
        />
      </div>

      {!gt.sufficient && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Ground truth ainda insuficiente</p>
          <p className="mt-1 text-xs text-muted-foreground">{gt.message}</p>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle
          title="Interesse por faixa de score"
          subtitle="Todos os participantes contra a coorte seletiva. Denominador = decisões registradas."
        />
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis
                unit="%"
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                stroke="var(--muted-foreground)"
              />
              <Tooltip content={<BucketTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="allPct"
                name="Todos"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              />
              <Bar
                dataKey="selectivePct"
                name="Seletivos"
                fill="var(--chart-3)"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Score da perspectiva de quem decidiu. Score não é porcentagem — a classificação usa ≥{" "}
          {HIGH_SCORE_MIN} como alta referência analítica e &lt; {LOW_SCORE_MAX} como score baixo.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            title="Quem gera os interesses de score baixo?"
            subtitle={`Composição dos ${data.low_score_interests.total} interesses com score < ${LOW_SCORE_MAX}.`}
          />
          {data.low_score_interests.total === 0 ? (
            <div className="mt-4">
              <EmptyBlock message="Nenhum interesse de score baixo registrado." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex h-4 w-full overflow-hidden rounded-full border border-border/60">
                {composition.map((row, i) => (
                  <div
                    key={row.key}
                    style={{
                      width: `${row.share.pct ?? 0}%`,
                      background: COMPOSITION_COLORS[i],
                    }}
                    title={`${row.label}: ${row.value} (${formatRate(row.share)})`}
                  />
                ))}
              </div>
              <ul className="space-y-1.5 text-sm">
                {composition.map((row, i) => (
                  <li key={row.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: COMPOSITION_COLORS[i] }}
                      />
                      {row.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {row.value} · {formatRate(row.share)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Confiança dos dados"
            subtitle="Cobertura taxonômica e integridade dos snapshots de match."
          />
          <div className="mt-4 space-y-4">
            <CoverageBar
              label="Necessidades canonicalizadas"
              r={tax.needs}
              freeText={data.taxonomy.needs_total - data.taxonomy.needs_canonical}
            />
            <CoverageBar
              label="Ofertas canonicalizadas"
              r={tax.offers}
              freeText={data.taxonomy.offers_total - data.taxonomy.offers_canonical}
            />
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>Snapshot íntegro</span>
                <span className="tabular-nums text-muted-foreground">
                  {data.snapshot.decisions - data.snapshot.drift - data.snapshot.unknown} de{" "}
                  {data.snapshot.decisions}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">
                  íntegro:{" "}
                  {data.snapshot.decisions - data.snapshot.drift - data.snapshot.unknown}
                </Badge>
                <Badge variant="outline" className="border-amber-500/50">
                  drift: {data.snapshot.drift}
                </Badge>
                {data.snapshot.unknown > 0 && (
                  <Badge variant="outline">desconhecido: {data.snapshot.unknown}</Badge>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {SNAPSHOT_DRIFT_DESCRIPTION}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CoverageBar({
  label,
  r,
  freeText,
}: {
  label: string;
  r: { pct: number | null; numerator: number; denominator: number };
  freeText: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {r.pct === null ? "—" : `${r.pct.toFixed(1)}%`} ({r.numerator}/{r.denominator})
        </span>
      </div>
      <Progress value={r.pct ?? 0} className="mt-2 h-2" />
      <p className="mt-1 text-[11px] text-muted-foreground">{freeText} em texto livre</p>
    </div>
  );
}

interface BucketPayload {
  label: string;
  decisions: number;
  interests: number;
  selectiveDecisions: number;
  selectiveInterests: number;
  allPct: number;
  selectivePct: number;
}

function BucketTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: BucketPayload }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-md">
      <p className="font-medium">Score {p.label}</p>
      <p className="mt-1 text-muted-foreground">
        Todos: {p.interests} interesses em {p.decisions} decisões ({p.allPct.toFixed(1)}%)
      </p>
      <p className="text-muted-foreground">
        Seletivos: {p.selectiveInterests} em {p.selectiveDecisions} (
        {p.selectivePct.toFixed(1)}%)
      </p>
      {p.decisions < 30 && <p className="mt-1 text-amber-600">Amostra pequena (N={p.decisions})</p>}
    </div>
  );
}
