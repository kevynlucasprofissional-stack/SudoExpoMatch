import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { IntelligenceTaxonomy } from "@/features/admin/intelligenceSchemas";
import {
  OBSERVED_OPPORTUNITY_NOTE,
  formatRate,
  taxonomySegmentRows,
  taxonomySideRows,
  taxonomySourceRows,
} from "@/features/admin/intelligencePresentation";
import { EmptyBlock, KpiCard, SectionTitle } from "./KpiCard";

const SIDE_LABEL: Record<string, string> = { need: "Necessidade", offer: "Oferta" };

export function TaxonomyTab({
  data,
  isPending,
}: {
  data?: IntelligenceTaxonomy;
  isPending: boolean;
}) {
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return <EmptyBlock message="Sem dados para este evento." />;

  const sides = taxonomySideRows(data);
  const sources = taxonomySourceRows(data);
  const segments = taxonomySegmentRows(data);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sides.map((s) => (
          <KpiCard
            key={s.side}
            label={`Cobertura — ${s.label}`}
            value={formatRate(s.coverage)}
            hint={`${s.canonical} canônicos · ${s.freeText} em texto livre`}
            description="Itens ativos ligados a um item canônico da taxonomia. Texto livre não participa das relações complementares."
            tone={(s.coverage.pct ?? 0) < 60 ? "warning" : "positive"}
          />
        ))}
        <KpiCard
          label="Itens canônicos ativos"
          value={data.taxonomy_items_active}
          description="Itens ativos no catálogo da taxonomia."
        />
        <KpiCard
          label="Relações complementares ativas"
          value={data.taxonomy_relations_active}
          description="Relações curadas 'quem precisa de A combina com quem oferece B'. Zero significa que o matcher só usa overlap direto."
          tone={data.taxonomy_relations_active === 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            title="Cobertura por origem do item"
            subtitle="De onde vem o item e quanto dele está canonicalizado."
          />
          <div className="mt-4 space-y-3">
            {sources.length === 0 && <EmptyBlock />}
            {sources.map((r) => (
              <div key={`${r.source}-${r.side}`}>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {r.source}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {SIDE_LABEL[r.side] ?? r.side}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatRate(r.coverage)} ({r.canonical}/{r.total})
                  </span>
                </div>
                <Progress value={r.coverage.pct ?? 0} className="mt-1.5 h-2" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Cobertura por segmento"
            subtitle="Ordenado pela menor cobertura — é onde a curadoria rende mais."
          />
          <div className="mt-4 space-y-3">
            {segments.length === 0 && <EmptyBlock />}
            {segments.map((r) => (
              <div key={r.segment_id}>
                <div className="flex items-center justify-between text-sm">
                  <span>{r.segment_label ?? r.segment_id}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatRate(r.coverage)} ({r.canonical}/{r.total})
                  </span>
                </div>
                <Progress value={r.coverage.pct ?? 0} className="mt-1.5 h-2" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Conceitos em texto livre mais recorrentes"
          subtitle="Demanda repetida que o matcher ainda não enxerga como item canônico."
          right={
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/taxonomia">
                Abrir taxonomia <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
        {data.free_text_top.length === 0 ? (
          <div className="mt-4">
            <EmptyBlock message="Nenhum item em texto livre neste evento." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2">Texto</th>
                  <th className="py-2">Lado</th>
                  <th className="py-2 text-right">Frequência</th>
                  <th className="py-2 text-right">Participantes</th>
                  <th className="py-2 text-right">Oportunidade observada</th>
                </tr>
              </thead>
              <tbody>
                {data.free_text_top.map((r) => (
                  <tr key={`${r.side}-${r.norm}`} className="border-b border-border/50">
                    <td className="py-2">{r.label}</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {SIDE_LABEL[r.side] ?? r.side}
                      </Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.frequency}</td>
                    <td className="py-2 text-right tabular-nums">{r.participants}</td>
                    <td className="py-2 text-right tabular-nums">{r.observed_opportunity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{OBSERVED_OPPORTUNITY_NOTE}</p>
      </Card>
    </div>
  );
}
