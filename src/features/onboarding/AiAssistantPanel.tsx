import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AiSuggestionItem, AiSuggestionResult } from "@/lib/onboarding-ai-schema";
import type { AnalysisKey, SharedAiAnalysis } from "./aiAnalysisState";
import { serializeAnalysisKey } from "./aiAnalysisState";
import { track } from "@/features/analytics/track";
import type { SocialBusinessContext } from "@/lib/social-context";
import type { BusinessSize, BusinessType } from "./types";


interface Props {
  kind: "offer" | "need";
  eventId: string;
  segmentId: string;
  summary: string;
  existingLabels: string[];
  analysis: SharedAiAnalysis;
  /** IMPL 9 — perfil declarado e contexto público, quando disponíveis. */
  businessSize?: BusinessSize | "";
  businessType?: BusinessType | "";
  niche?: string;
  socialContext?: SocialBusinessContext | null;
  /**
   * Aceita um lote de sugestões atomicamente. `source` é a origem REAL do
   * resultado (ai vs heuristic). O parent deve fazer o merge respeitando o
   * limite total; use `mergeCapped` de `./mergeItems`.
   */
  onAcceptMany: (items: AiSuggestionItem[], source: "ai" | "heuristic") => void;
  disabled?: boolean;
}

function analysisKey(p: Props): AnalysisKey {
  return {
    eventId: p.eventId,
    segmentId: p.segmentId,
    summary: p.summary,
    businessSize: p.businessSize ?? "",
    businessType: p.businessType ?? "",
    niche: p.niche ?? "",
    socialContext: p.socialContext ?? null,
  };
}


export function AiAssistantPanel(props: Props) {
  const { analysis } = props;
  const key = analysisKey(props);
  const activeKeyId = serializeAnalysisKey(key);

  const st = analysis.status;
  const matched = (st.s === "done" || st.s === "dismissed") && st.keyId === activeKeyId;
  const showResult = matched && st.s === "done";
  const dismissedForKey = matched && st.s === "dismissed";

  const result: AiSuggestionResult | null = showResult
    ? (st as { s: "done"; result: AiSuggestionResult }).result
    : null;
  const items = result ? (props.kind === "offer" ? result.offers : result.needs) : [];
  const source: "ai" | "heuristic" = result?.source ?? "ai";
  const isFallback = result?.source === "heuristic";

  async function run() {
    if (props.disabled) return;
    track({
      kind: "ai_suggestion_requested",
      eventId: props.eventId,
      payload: { kind: props.kind },
      dedupeKey: `ai_suggestion_requested:${props.kind}:${activeKeyId}`,
    });
    await analysis.analyze(key, props.existingLabels);
  }

  function acceptAll() {
    if (!result) return;
    // Filtra apenas o que ainda NÃO está em existingLabels (case-insensitive).
    // Merge e cap acontecem no parent, garantindo atomicidade em uma única
    // atualização do draft.
    const existingLower = new Set(props.existingLabels.map((l) => l.trim().toLowerCase()));
    const toAdd = items.filter((i) => !existingLower.has(i.label.trim().toLowerCase()));
    if (toAdd.length === 0) return;
    track({
      kind: "ai_suggestion_accepted",
      eventId: props.eventId,
      payload: { kind: props.kind, source, count: toAdd.length },
      dedupeKey: `ai_suggestion_accepted:${props.kind}:${activeKeyId}:all`,
    });
    props.onAcceptMany(toAdd, source);
  }

  const loading = st.s === "loading" && st.keyId === activeKeyId;
  const error = st.s === "error" && st.keyId === activeKeyId;

  // Painel fechado (dismissed) para esta chave: link discreto para reabrir.
  if (dismissedForKey) {
    return (
      <div className="mt-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={analysis.reopen}
          className="text-xs text-muted-foreground"
        >
          <Wand2 className="mr-1 h-3 w-3" /> Reabrir sugestões
        </Button>
      </div>
    );
  }

  const remainingSuggestions = items.filter(
    (s) => !props.existingLabels.some((l) => l.toLowerCase() === s.label.toLowerCase()),
  );

  return (
    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Análise inteligente do seu resumo</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={result ? "outline" : "default"}
            onClick={run}
            disabled={loading || props.disabled}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Analisando…
              </>
            ) : result ? (
              "Analisar de novo"
            ) : (
              "Analisar com IA"
            )}
          </Button>
          {result && (
            <Button
              size="sm"
              variant="ghost"
              onClick={analysis.dismiss}
              aria-label="Fechar painel de sugestões"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-muted-foreground">
          Não conseguimos analisar agora. Continue adicionando manualmente ou tente de novo.
        </p>
      )}

      {isFallback && (
        <p className="mt-3 text-xs text-muted-foreground">Usamos sugestões padrão desta vez.</p>
      )}

      {result?.understanding &&
        (result.understanding.mainActivity || result.understanding.keywords.length > 0) && (
          <div className="mt-3 space-y-1 text-xs">
            {result.understanding.mainActivity && (
              <p>
                <span className="font-medium">Atividade principal:</span>{" "}
                {result.understanding.mainActivity}
              </p>
            )}
            {result.understanding.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.understanding.keywords.map((k) => (
                  <Badge key={k} variant="secondary" className="text-[10px]">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
            {result.understanding.clarifyingQuestion && (
              <p className="italic text-muted-foreground">
                {result.understanding.clarifyingQuestion}
              </p>
            )}
          </div>
        )}

      {items.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sugestões de {props.kind === "offer" ? "ofertas" : "necessidades"} — confirme as que
              fazem sentido
            </p>
            {remainingSuggestions.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={acceptAll}
                disabled={props.disabled}
                className="h-7 text-xs"
              >
                Aceitar todas
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {items.map((s) => {
              const already = props.existingLabels.some(
                (l) => l.toLowerCase() === s.label.toLowerCase(),
              );
              return (
                <button
                  key={s.label + (s.taxonomyItemId ?? "")}
                  type="button"
                  disabled={already || props.disabled}
                  onClick={() => {
                    track({
                      kind: "ai_suggestion_accepted",
                      eventId: props.eventId,
                      payload: { kind: props.kind, source, count: 1 },
                      dedupeKey: `ai_suggestion_accepted:${props.kind}:${activeKeyId}:${s.label}`,
                    });
                    props.onAcceptMany([s], source);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-all disabled:opacity-50 ${
                    already
                      ? "border-success bg-success/10"
                      : "hover:border-primary hover:bg-primary/5"
                  }`}
                  title={s.rationale}
                >
                  <Sparkles className="h-3 w-3" />
                  {already ? "✓ " : "+ "}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
