import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, Quote } from "lucide-react";

import type { MatchBriefing, MatchDetail } from "@/features/admin/matchesSchemas";
import { fmtDateTime } from "@/features/admin/matchesPresentation";
import {
  buildDeterministicRisks,
  explainReason,
  shortName,
  signalText,
  type TopReason,
} from "@/features/admin/matchExplanation";
import { translateBriefingError, useGenerateMatchBriefing } from "@/features/admin/useMatchBriefing";

const SOURCE_TEXT: Record<string, string> = {
  cadastro: "cadastro",
  ia: "IA do onboarding",
  instagram: "Instagram",
};

function toTopReasons(reasons: MatchDetail["reasons_a"]): TopReason[] {
  return reasons.map((r) => ({
    code: r.code,
    label: r.label,
    weight: r.weight,
    need_label: r.need?.label ?? null,
    offer_label: r.offer?.label ?? null,
  }));
}

/**
 * "Por que conectar" — camada determinística sempre visível + leitura
 * comercial de IA sob demanda (salva no banco e reaproveitada).
 */
export function MatchBriefingPanel({
  detail,
  eventId,
}: {
  detail: MatchDetail;
  eventId: string;
}) {
  const a = shortName(detail.profile_a.name);
  const b = shortName(detail.profile_b.name);
  const ra = toTopReasons(detail.reasons_a);
  const rb = toTopReasons(detail.reasons_b);
  const briefing = (detail.briefing ?? null) as MatchBriefing | null;
  const mutation = useGenerateMatchBriefing(eventId);

  const risks = buildDeterministicRisks({
    scoreGap: detail.match.score_gap,
    whyA: ra,
    whyB: rb,
    names: { a, b },
  });

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="match-briefing">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Por que conectar</h3>
        <div className="flex items-center gap-2">
          {briefing?.stale ? (
            <Badge variant="destructive" data-testid="briefing-stale">
              Desatualizado
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant={briefing ? "outline" : "default"}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ matchId: detail.match.id })}
            data-testid="generate-briefing"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {mutation.isPending
              ? "Gerando…"
              : briefing
                ? "Regenerar com IA"
                : "Gerar leitura comercial com IA"}
          </Button>
        </div>
      </header>

      {mutation.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {translateBriefingError(mutation.error)}
        </p>
      ) : null}

      {briefing ? (
        <p className="text-sm font-medium" data-testid="briefing-summary">
          {briefing.summary}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Resumo automático dos sinais do matcher. Gere a leitura com IA para um dossiê comercial
          completo, com evidências do cadastro e do Instagram.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {a} ganha com {b}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {(briefing?.sides.a?.length ? briefing.sides.a : ra.map((r) => explainReason(r, { self: a, other: b }))).map(
              (line, i) => (
                <li key={i}>• {line}</li>
              ),
            )}
            {ra.length === 0 && !briefing?.sides.a?.length ? (
              <li className="text-muted-foreground">Sem motivos registrados.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {b} ganha com {a}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {(briefing?.sides.b?.length ? briefing.sides.b : rb.map((r) => explainReason(r, { self: b, other: a }))).map(
              (line, i) => (
                <li key={i}>• {line}</li>
              ),
            )}
            {rb.length === 0 && !briefing?.sides.b?.length ? (
              <li className="text-muted-foreground">Sem motivos registrados.</li>
            ) : null}
          </ul>
        </div>
      </div>

      {briefing?.evidence.length ? (
        <div data-testid="briefing-evidence">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidências</p>
          <ul className="mt-1 space-y-1 text-sm">
            {briefing.evidence.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{SOURCE_TEXT[e.source] ?? e.source}</Badge>
                <span>{e.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {[...ra, ...rb].slice(0, 6).map((r, i) => (
            <Badge key={`${r.code}-${i}`} variant="outline">
              {signalText(r.code)}
            </Badge>
          ))}
        </div>
      )}

      {(briefing?.risks.length ? briefing.risks : risks).length > 0 ? (
        <div data-testid="briefing-risks">
          <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Pontos de atenção
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {(briefing?.risks.length ? briefing.risks : risks).map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {briefing?.approach ? (
        <p className="flex gap-2 rounded-md border bg-background p-3 text-sm" data-testid="briefing-approach">
          <Quote className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{briefing.approach}</span>
        </p>
      ) : null}

      {briefing ? (
        <p className="text-xs text-muted-foreground">
          Gerado por IA ({briefing.model ?? "modelo não informado"}) em{" "}
          {fmtDateTime(briefing.generated_at)}.
          {briefing.stale
            ? " Os perfis mudaram desde então — regenere antes de usar."
            : ""}
        </p>
      ) : null}
    </section>
  );
}
