import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { suggestOnboardingItems } from "@/lib/onboarding-ai.functions";
import type { AiSuggestionItem, AiSuggestionResult } from "@/lib/onboarding-ai-schema";

interface Props {
  eventId: string;
  segmentId: string;
  summary: string;
  existingLabels: string[];
  onAcceptOffer: (item: AiSuggestionItem) => void;
  onAcceptNeed: (item: AiSuggestionItem) => void;
  onResult?: (r: AiSuggestionResult) => void;
  kind: "offer" | "need";
  disabled?: boolean;
}

export function AiAssistantPanel(props: Props) {
  const suggest = useServerFn(suggestOnboardingItems);
  const [state, setState] = useState<
    | { s: "idle" }
    | { s: "loading" }
    | { s: "done"; result: AiSuggestionResult }
    | { s: "error" }
  >({ s: "idle" });

  async function run() {
    if (props.disabled) return;
    setState({ s: "loading" });
    try {
      const result = await suggest({
        data: {
          eventId: props.eventId,
          segmentId: props.segmentId,
          summary: props.summary,
          existingLabels: props.existingLabels,
        },
      });
      setState({ s: "done", result });
      props.onResult?.(result);
    } catch {
      setState({ s: "error" });
    }
  }

  const items =
    state.s === "done" ? (props.kind === "offer" ? state.result.offers : state.result.needs) : [];
  const understanding = state.s === "done" ? state.result.understanding : null;
  const isFallback = state.s === "done" && state.result.source === "heuristic";

  return (
    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Análise inteligente do seu resumo</span>
        </div>
        <Button
          size="sm"
          variant={state.s === "idle" ? "default" : "outline"}
          onClick={run}
          disabled={state.s === "loading" || props.disabled}
        >
          {state.s === "loading" ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Analisando…
            </>
          ) : state.s === "done" ? (
            "Analisar de novo"
          ) : (
            "Analisar com IA"
          )}
        </Button>
      </div>

      {state.s === "error" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Não conseguimos analisar agora. Continue adicionando manualmente ou tente de novo.
        </p>
      )}

      {isFallback && (
        <p className="mt-3 text-xs text-muted-foreground">Usamos sugestões padrão desta vez.</p>
      )}

      {understanding && (understanding.mainActivity || understanding.keywords.length > 0) && (
        <div className="mt-3 space-y-1 text-xs">
          {understanding.mainActivity && (
            <p>
              <span className="font-medium">Atividade principal:</span> {understanding.mainActivity}
            </p>
          )}
          {understanding.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {understanding.keywords.map((k) => (
                <Badge key={k} variant="secondary" className="text-[10px]">
                  {k}
                </Badge>
              ))}
            </div>
          )}
          {understanding.clarifyingQuestion && (
            <p className="italic text-muted-foreground">{understanding.clarifyingQuestion}</p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sugestões de {props.kind === "offer" ? "ofertas" : "necessidades"} — confirme as que fazem sentido
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((s) => {
              const already = props.existingLabels.some(
                (l) => l.toLowerCase() === s.label.toLowerCase(),
              );
              return (
                <button
                  key={s.label + (s.taxonomyItemId ?? "")}
                  type="button"
                  disabled={already}
                  onClick={() =>
                    props.kind === "offer" ? props.onAcceptOffer(s) : props.onAcceptNeed(s)
                  }
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-all disabled:opacity-50 ${
                    already ? "border-success bg-success/10" : "hover:border-primary hover:bg-primary/5"
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
