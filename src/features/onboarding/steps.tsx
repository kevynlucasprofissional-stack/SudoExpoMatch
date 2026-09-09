import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Plus, Search, Sparkles, Star, Target, Trash2, User, X } from "lucide-react";
import {
  AI_SUGGESTION_BADGE,
  buildSuggestionFeed,
  suggestionIdentity,
  type FeedSuggestion,
} from "./suggestionFeed";

import { useAutoAiSuggestions } from "./useAutoAiSuggestions";
import { normalizeConfirmedOffers } from "./aiAnalysisState";
import type { SharedAiAnalysis } from "./aiAnalysisState";
import { mergeCapped } from "./mergeItems";
import { hasEquivalentItem } from "./itemIdentity";
import { canonicalizeItem } from "./canonicalizeItems";
import type { SocialBusinessContext } from "@/lib/social-context";
import type { SocialEnrichmentResult } from "@/lib/social-enrichment";
import type { SocialBusinessAnalysis } from "@/lib/social-analysis";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NetworkGraphic } from "@/components/brand/NetworkGraphic";
import {
  ANY_LABEL,
  BUSINESS_SIZE_LABEL,
  BUSINESS_TYPE_LABEL,
  BusinessProfileCriteria,
  profileSelectableSegments,
} from "./BusinessProfileCriteria";

import type { EventCatalog, CatalogTaxonomyItem } from "@/features/participant/types";
import type { NeedKind } from "@/lib/types";
import type {
  SubmitState,
  WizardDraft,
  WizardMode,
  WizardNeed,
  WizardOffer,
} from "./types";
import { cryptoUid } from "./draft";
import { ANY_PREFERENCE } from "./types";
import { heuristicSuggestionProvider } from "./suggestions";
import type { SuggestionItem } from "./types";
import { OTHER_SEGMENT_ID, phoneCreateSchema, phoneEditSchema } from "./schemas";
import { isSubmitting, reviewIsActionable } from "./submitMachine";
import {
  currentPriorityId,
  targetProfileAnswered,
  type WizardValidation,
} from "./validate";

const NEED_KIND_OPTIONS: { value: NeedKind; label: string }[] = [
  { value: "servico", label: "Serviço" },
  { value: "fornecedor", label: "Fornecedor" },
  { value: "parceiro", label: "Parceiro" },
  { value: "compradores", label: "Comprador" },
  { value: "distribuidores", label: "Distribuidor" },
  { value: "profissionais", label: "Profissional" },
  { value: "produtos", label: "Produto" },
  { value: "outro", label: "Outro" },
];
const NEED_LABEL: Record<NeedKind, string> = Object.fromEntries(
  NEED_KIND_OPTIONS.map((o) => [o.value, o.label]),
) as Record<NeedKind, string>;

interface BaseProps {
  draft: WizardDraft;
  update: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void;
  onNext: () => void;
  onBack?: () => void;
}

// ============================================================================
// Field + ReviewRow
// ============================================================================
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

// ============================================================================
// StepIdentity
// ============================================================================
export function StepIdentity({
  draft,
  update,
  onNext,
  mode,
  phone,
  onPhoneChange,
  resetAction,
}: BaseProps & {
  mode: WizardMode;
  phone: string;
  onPhoneChange: (v: string) => void;
  resetAction?: ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleNext() {
    const errs: Record<string, string> = {};
    if (draft.name.trim().length < 2) errs.name = "Informe seu nome";
    if (draft.company.trim().length < 2) errs.company = "Informe sua empresa";
    if (draft.city.trim().length < 2) errs.city = "Informe sua cidade";
    if (!draft.consent) errs.consent = "É preciso aceitar";

    const phoneSchema = mode === "create" ? phoneCreateSchema : phoneEditSchema;
    const p = phoneSchema.safeParse(phone);
    if (!p.success) errs.whatsapp = p.error.issues[0]?.message ?? "WhatsApp inválido";

    setErrors(errs);
    if (Object.keys(errs).length === 0) onNext();
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">Vamos nos conhecer</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "edit"
          ? "Atualize seus dados. Seu contato atual está protegido — preencha apenas para atualizar."
          : "Suas informações de contato ficam privadas."}
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Nome completo" error={errors.name}>
          <Input
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Ex.: Ana Ribeiro"
            autoComplete="name"
          />
        </Field>
        <Field label="Empresa" error={errors.company}>
          <Input
            value={draft.company}
            onChange={(e) => update("company", e.target.value)}
            placeholder="Ex.: Ribeiro Consultoria"
            autoComplete="organization"
          />
        </Field>
        <Field
          label={mode === "edit" ? "WhatsApp (opcional — apenas para atualizar)" : "WhatsApp"}
          error={errors.whatsapp}
        >
          <Input
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="(64) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
          />
          {mode === "edit" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Seu contato atual está protegido. Preencha apenas para atualizar.
            </p>
          )}
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cidade" error={errors.city}>
            <Input
              value={draft.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Rio Verde"
            />
          </Field>
          <Field label="Bairro (opcional)">
            <Input
              value={draft.neighborhood}
              onChange={(e) => update("neighborhood", e.target.value)}
              placeholder="Centro"
            />
          </Field>
        </div>
        <label className="flex items-start gap-2 rounded-lg border p-3">
          <Checkbox
            checked={draft.consent}
            onCheckedChange={(v) => update("consent", Boolean(v))}
            aria-invalid={!!errors.consent}
          />
          <span className="text-sm">
            Concordo com o uso das minhas informações para gerar conexões durante o evento.
            {errors.consent && (
              <span className="mt-1 block text-xs text-destructive">{errors.consent}</span>
            )}
          </span>
        </label>
      </div>

      <div className="mt-6 flex justify-between">
        <div className="flex flex-wrap items-center gap-2">{resetAction}</div>
        <Button size="lg" onClick={handleNext}>
          Continuar
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepWhoIAm — porte, tipo, segmento, nicho e resumo
// ============================================================================
// Os classificadores de porte/tipo/segmento moram em `BusinessProfileCriteria`
// e são compartilhados por "Quem eu sou" e "Quem eu procuro".
export { BUSINESS_SIZE_LABEL, BUSINESS_TYPE_LABEL } from "./BusinessProfileCriteria";

/** Estado de UI do enriquecimento por Instagram (nunca bloqueia o cadastro). */
export interface SocialLookupUiState {
  status: "idle" | "loading" | "done";
  result: SocialEnrichmentResult | null;
  message: string;
}

export function StepWhoIAm({
  draft,
  update,
  onNext,
  catalog,
  manualMode = false,
  manualSegmentLabel,
  social,
  resetAction,
}: BaseProps & {
  catalog: EventCatalog;
  resetAction?: ReactNode;
  manualMode?: boolean;
  manualSegmentLabel?: string;
  social?: SocialLookupUiState;
}) {
  const isOther = draft.segmentId === OTHER_SEGMENT_ID;
  const nicheOk = !isOther || draft.niche.trim().length >= 3;
  const canNext =
    !!draft.segmentId &&
    !!draft.businessSize &&
    !!draft.businessType &&
    nicheOk &&
    draft.summary.trim().length > 0;

  function handleSelect(segmentId: string) {
    if (draft.segmentId && draft.segmentId !== segmentId) {
      const prev = draft.segmentId;
      update(
        "offers",
        // IMPL 7: itens com taxonomy item mantêm o segmento da própria taxonomia.
        draft.offers.map((o) =>
          !o.taxonomyItemId && o.segmentId === prev ? { ...o, segmentId } : o,
        ),
      );
      update(
        "needs",
        draft.needs.map((n) =>
          !n.taxonomyItemId && n.segmentId === prev ? { ...n, segmentId } : n,
        ),
      );
    }
    update("segmentId", segmentId);
  }

  return (
    <Card className="border-t-4 border-t-secondary bg-gradient-to-b from-secondary/5 to-transparent p-6">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
        <User className="h-3.5 w-3.5" aria-hidden="true" /> Etapa 2 · Meu perfil
      </p>
      <h2 className="mt-1 font-display text-2xl font-semibold">Quem eu sou</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {manualMode
          ? "Catálogo indisponível — o segmento atual está bloqueado para edição."
          : "Este é o meu perfil: conte o porte, o tipo de atuação e o segmento da sua empresa."}
      </p>

      <div className="mt-6 space-y-6">
        <BusinessProfileCriteria
          mode="self"
          segments={catalog.segments}
          size={draft.businessSize}
          type={draft.businessType}
          segmentId={draft.segmentId}
          onSizeChange={(v) => v !== ANY_PREFERENCE && update("businessSize", v)}
          onTypeChange={(v) => v !== ANY_PREFERENCE && update("businessType", v)}
          onSegmentChange={handleSelect}
          manualMode={manualMode}
          manualSegmentLabel={manualSegmentLabel}
        />


        <div>
          <Label htmlFor="niche">
            {isOther ? "Nicho — descreva sua atividade" : "Nicho (opcional)"}
          </Label>
          <Input
            id="niche"
            value={draft.niche}
            onChange={(e) => update("niche", e.target.value.slice(0, 120))}
            placeholder={
              isOther ? "Ex.: Manutenção de equipamentos agrícolas" : "Ex.: Panificação artesanal"
            }
            className="mt-1"
            maxLength={120}
          />
          {isOther && !nicheOk && (
            <p className="mt-1 text-xs text-muted-foreground">
              Como você escolheu "Outros", explique sua atividade aqui.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="summary">Resumo profissional</Label>
          <Textarea
            id="summary"
            value={draft.summary}
            onChange={(e) => update("summary", e.target.value)}
            placeholder="Ex.: Oferecemos serviços de contabilidade para pequenas indústrias e restaurantes na região."
            className="mt-1 min-h-[110px]"
            maxLength={500}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.summary.length}/500 · Pode ser bem curto (ex.: "Loja")
          </p>
        </div>

        <div>
          <Label htmlFor="instagram">Instagram (opcional)</Label>
          <Input
            id="instagram"
            value={draft.instagram}
            onChange={(e) => update("instagram", e.target.value.slice(0, 300))}
            placeholder="@minhaempresa"
            maxLength={300}
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Usaremos apenas informações públicas para personalizar suas sugestões.
          </p>
          {social && social.status === "done" && social.message && (
            <p
              aria-live="polite"
              className={`mt-1 text-xs ${
                social.result?.status === "ok" ? "text-success" : "text-muted-foreground"
              }`}
            >
              {social.message}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {resetAction}
        </div>
        <Button
          onClick={onNext}
          disabled={!canNext || social?.status === "loading"}
          data-testid="who-i-am-continue"
        >
          {social?.status === "loading" ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Preparando suas sugestões…
            </>
          ) : (
            "Continuar"
          )}
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepOffers
// ============================================================================
export function StepOffers({
  draft,
  update,
  onNext,
  catalog,
  eventId,
  aiAnalysis,
  socialContext,
  socialAnalysis,
  resetAction,
}: BaseProps & {
  catalog: EventCatalog;
  resetAction?: ReactNode;
  eventId?: string;
  aiAnalysis?: SharedAiAnalysis;
  socialContext?: SocialBusinessContext | null;
  socialAnalysis?: SocialBusinessAnalysis | null;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (catalog.taxonomy.length === 0) {
      // Modo manual (catálogo indisponível) — sem sugestões.
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    heuristicSuggestionProvider
      .suggest({
        segmentId: draft.segmentId,
        summary: draft.summary,
        catalog,
      })
      .then((r) => {
        if (cancelled) return;
        setSuggestions(r.items.filter((i) => i.kind === "offer"));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.segmentId, draft.summary, catalog]);

  // IMPL 22 — IA automática: roda uma única vez por contexto semântico, em
  // paralelo às heurísticas (que já estão clicáveis). Sem botão manual.
  const { items: aiItems, loading: aiLoading } = useAutoAiSuggestions({
    focus: "offers",
    enabled: Boolean(eventId && aiAnalysis),
    eventId,
    segmentId: draft.segmentId,
    summary: draft.summary,
    businessSize: draft.businessSize,
    businessType: draft.businessType,
    niche: draft.niche,
    socialContext: socialContext ?? null,
    socialAnalysis: socialAnalysis ?? null,
    existingLabels: draft.offers.map((o) => o.label),
    analysis: aiAnalysis,
  });

  // Lista ÚNICA: heurística + IA, sem duplicatas, com proveniência.
  const feed = useMemo(
    () =>
      buildSuggestionFeed({
        kind: "offer",
        heuristic: suggestions,
        ai: aiItems,
        existing: draft.offers,
      }),
    [suggestions, aiItems, draft.offers],
  );

  /** IA sugere, usuário confirma — nada é adicionado automaticamente. */
  function addFromFeed(s: FeedSuggestion) {
    addFromSuggestion(
      {
        taxonomyItemId: s.taxonomyItemId,
        segmentId: s.segmentId,
        label: s.label,
        kind: "offer",
      },
      s.source,
    );
  }

  /** Vincula ao item canônico do catálogo quando a correspondência é exata e única. */
  function canonicalizeOffer(offer: WizardOffer): WizardOffer {
    return canonicalizeItem(offer, {
      kind: "offer",
      catalog: catalog.taxonomy,
      usedTaxonomyIds: draft.offers
        .map((o) => o.taxonomyItemId)
        .filter((v): v is string => Boolean(v)),
    });
  }

  function addFromSuggestion(s: SuggestionItem, source: WizardOffer["source"] = "heuristic") {
    if (draft.offers.length >= 5) return;
    if (hasEquivalentItem(draft.offers, s)) return;
    const offer: WizardOffer = canonicalizeOffer({
      localId: cryptoUid(),
      label: s.label,
      // IMPL 7: segmento do taxonomy item; perfil só como fallback (texto livre).
      segmentId: s.segmentId ?? draft.segmentId,
      taxonomyItemId: s.taxonomyItemId,
      source,
    });
    update("offers", [...draft.offers, offer]);
  }

  function addCustom(label: string) {
    const clean = label.trim();
    if (clean.length < 2 || draft.offers.length >= 5) return;
    if (hasEquivalentItem(draft.offers, { label: clean, taxonomyItemId: null })) return;
    const offer: WizardOffer = canonicalizeOffer({
      localId: cryptoUid(),
      label: clean,
      segmentId: draft.segmentId,
      taxonomyItemId: null,
    });
    update("offers", [...draft.offers, offer]);
    setCustom("");
  }

  function removeOffer(localId: string) {
    update(
      "offers",
      draft.offers.filter((o) => o.localId !== localId),
    );
  }

  // IMPL 23: um item já presente no feed unificado NÃO se repete aqui.
  const feedIdentities = useMemo(() => new Set(feed.map((s) => s.identity)), [feed]);
  const segmentTax: CatalogTaxonomyItem[] = useMemo(
    () =>
      catalog.taxonomy
        .filter(
          (t) => t.segment_id === draft.segmentId && (t.kind === "offer" || t.kind === "both"),
        )
        .filter((t) => !feedIdentities.has(suggestionIdentity({ taxonomyItemId: t.id, label: t.label })))
        .filter((t) => !feedIdentities.has(suggestionIdentity({ taxonomyItemId: null, label: t.label })))
        // Já adicionado pela pessoa não reaparece em "Comuns no seu segmento".
        .filter((t) => !hasEquivalentItem(draft.offers, { label: t.label, taxonomyItemId: t.id }))
        .slice(0, 8),
    [catalog, draft.segmentId, draft.offers, feedIdentities],
  );


  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">O que você oferece</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Até 5 itens. Use as sugestões, edite ou adicione os seus.
          </p>
        </div>
        <Sparkles className="h-5 w-5 shrink-0 text-accent animate-float-slow" />
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analisando seu resumo…
        </div>
      )}

      {!loading && feed.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sugeridos para você (confirme os que fazem sentido)
            </p>
            {aiLoading && (
              <span
                data-testid="ai-personalizing"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin" /> Personalizando sugestões…
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {feed.map((s) => (
              <button
                key={s.identity}
                type="button"
                data-testid="suggestion-chip"
                data-source={s.source}
                onClick={() => addFromFeed(s)}
                disabled={draft.offers.length >= 5}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                + {s.label}
                {s.fromAi && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {AI_SUGGESTION_BADGE}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {segmentTax.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Comuns no seu segmento
          </p>
          <div className="flex flex-wrap gap-2">
            {segmentTax.map((t) => {
              if (hasEquivalentItem(draft.offers, { label: t.label, taxonomyItemId: t.id })) {
                return null;
              }
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    addFromSuggestion({
                      // IMPL 7: só é autoritativo o item com segmento próprio.
                      taxonomyItemId: t.segment_id?.trim() ? t.id : null,
                      segmentId: t.segment_id?.trim() || null,
                      label: t.label,
                      kind: "offer",
                    })
                  }
                  disabled={draft.offers.length >= 5}
                  className="rounded-full border px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  + {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="flex gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Outro: descreva o que você oferece"
            aria-invalid={custom.trim().length === 1}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom(custom);
              }
            }}
          />
          <Button
            type="button"
            onClick={() => addCustom(custom)}
            disabled={custom.trim().length < 2 || draft.offers.length >= 5}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {custom.trim().length === 1 && (
          <p className="mt-1.5 text-sm text-destructive">Descreva com pelo menos 2 caracteres</p>
        )}
      </div>


      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">Seus itens ({draft.offers.length}/5)</p>
        {draft.offers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhum item ainda. Escolha das sugestões acima.
          </p>
        ) : (
          <ul className="space-y-2">
            {draft.offers.map((o) => (
              <li
                key={o.localId}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
              >
                <span className="text-sm">{o.label}</span>
                <button
                  type="button"
                  onClick={() => removeOffer(o.localId)}
                  aria-label={`Remover ${o.label}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {resetAction}
        </div>
        <Button onClick={onNext} disabled={draft.offers.length === 0}>
          Continuar
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepNeeds
// ============================================================================
export function StepNeeds({
  draft,
  update,
  onNext,
  catalog,
  eventId,
  aiAnalysis,
  socialContext,
  socialAnalysis,
  resetAction,
  title,
  subtitle,
  eyebrow,
  nextBlocked = false,
}: BaseProps & {
  catalog: EventCatalog;
  resetAction?: ReactNode;
  eventId?: string;
  aiAnalysis?: SharedAiAnalysis;
  socialContext?: SocialBusinessContext | null;
  socialAnalysis?: SocialBusinessAnalysis | null;
  /** Rótulos contextuais — a lógica de sugestões/IA permanece intacta. */
  title?: string;
  subtitle?: string;
  eyebrow?: ReactNode;
  /** Bloqueia "Continuar" enquanto o perfil desejado não estiver respondido. */
  nextBlocked?: boolean;
}) {
  const [kind, setKind] = useState<NeedKind>("servico");
  const [label, setLabel] = useState("");

  const segmentTaxAll = useMemo(
    () =>
      catalog.taxonomy
        .filter((t) => t.segment_id === draft.segmentId && (t.kind === "need" || t.kind === "both"))
        .slice(0, 10),
    [catalog, draft.segmentId],
  );


  // Heurísticas — aparecem imediatamente, sem esperar a IA.
  const [heuristicNeeds, setHeuristicNeeds] = useState<SuggestionItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (catalog.taxonomy.length === 0) {
      setHeuristicNeeds([]);
      return;
    }
    heuristicSuggestionProvider
      .suggest({ segmentId: draft.segmentId, summary: draft.summary, catalog })
      .then((r) => {
        if (!cancelled) setHeuristicNeeds(r.items.filter((i) => i.kind === "need"));
      })
      .catch(() => {
        if (!cancelled) setHeuristicNeeds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.segmentId, draft.summary, catalog]);

  // IMPL 22 — a análise da Etapa 4 é semanticamente diferente: considera as
  // ofertas CONFIRMADAS na Etapa 3. Trocar uma oferta invalida a análise;
  // não mexer nelas reaproveita a anterior (zero chamada).
  const confirmedOffers = useMemo(() => normalizeConfirmedOffers(draft.offers), [draft.offers]);
  const { items: aiItems, loading: aiLoading } = useAutoAiSuggestions({
    focus: "needs",
    enabled: Boolean(eventId && aiAnalysis),
    eventId,
    segmentId: draft.segmentId,
    summary: draft.summary,
    businessSize: draft.businessSize,
    businessType: draft.businessType,
    niche: draft.niche,
    socialContext: socialContext ?? null,
    socialAnalysis: socialAnalysis ?? null,
    existingLabels: draft.needs.map((n) => n.label),
    confirmedOffers,
    analysis: aiAnalysis,
  });

  const feed = useMemo(
    () =>
      buildSuggestionFeed({
        kind: "need",
        heuristic: heuristicNeeds,
        ai: aiItems,
        existing: draft.needs,
      }),
    [heuristicNeeds, aiItems, draft.needs],
  );

  // IMPL 23: sem repetir no "Comuns no seu segmento" o que já está no feed.
  const feedIdentities = useMemo(() => new Set(feed.map((s) => s.identity)), [feed]);
  const segmentTax = useMemo(
    () =>
      segmentTaxAll
        .filter(
          (t) => !feedIdentities.has(suggestionIdentity({ taxonomyItemId: t.id, label: t.label })),
        )
        .filter(
          (t) => !feedIdentities.has(suggestionIdentity({ taxonomyItemId: null, label: t.label })),
        )
        // Já adicionado pela pessoa não reaparece em "Comuns no seu segmento".
        .filter((t) => !hasEquivalentItem(draft.needs, { label: t.label, taxonomyItemId: t.id })),
    [segmentTaxAll, draft.needs, feedIdentities],
  );



  /** Vincula ao item canônico do catálogo quando a correspondência é exata e única. */
  function canonicalizeNeed(need: WizardNeed): WizardNeed {
    return canonicalizeItem(need, {
      kind: "need",
      catalog: catalog.taxonomy,
      usedTaxonomyIds: draft.needs
        .map((n) => n.taxonomyItemId)
        .filter((v): v is string => Boolean(v)),
    });
  }

  /** IA sugere, usuário confirma. `needKind` vem do item, nunca do seletor. */
  function addFromFeed(s: FeedSuggestion) {
    if (draft.needs.length >= 5) return;
    if (hasEquivalentItem(draft.needs, s)) return;
    const need: WizardNeed = canonicalizeNeed({
      localId: cryptoUid(),
      label: s.label,
      segmentId: s.segmentId ?? draft.segmentId,
      taxonomyItemId: s.taxonomyItemId,
      needKind: s.needKind ?? (s.fromAi ? "outro" : kind),
      isPriority: false,
      source: s.source,
    });
    update("needs", [...draft.needs, need]);
  }

  function addFromCatalog(t: CatalogTaxonomyItem) {
    if (draft.needs.length >= 5) return;
    if (hasEquivalentItem(draft.needs, { label: t.label, taxonomyItemId: t.id })) return;
    // IMPL 7: item sem segmento próprio não é autoritativo → vira texto livre.
    const seg = t.segment_id?.trim() || null;
    const need: WizardNeed = {
      localId: cryptoUid(),
      label: t.label,
      segmentId: seg ?? draft.segmentId,
      taxonomyItemId: seg ? t.id : null,
      needKind: kind,
      isPriority: false,
    };
    update("needs", [...draft.needs, need]);
  }

  function addCustom() {
    const clean = label.trim();
    if (clean.length < 2 || draft.needs.length >= 5) return;
    if (hasEquivalentItem(draft.needs, { label: clean, taxonomyItemId: null })) return;
    const need: WizardNeed = canonicalizeNeed({
      localId: cryptoUid(),
      label: clean,
      segmentId: draft.segmentId,
      taxonomyItemId: null,
      needKind: kind,
      isPriority: false,
    });
    update("needs", [...draft.needs, need]);
    setLabel("");
  }

  function remove(localId: string) {
    update(
      "needs",
      draft.needs.filter((n) => n.localId !== localId),
    );
  }

  // Prioridade agora vive nesta etapa. Regra: exatamente uma necessidade
  // marcada. Se nenhuma estiver marcada (item novo, rascunho antigo ou item
  // prioritário removido), a primeira assume automaticamente.
  const priorityId = currentPriorityId(draft);
  useEffect(() => {
    if (draft.needs.length === 0) return;
    const marked = draft.needs.filter((n) => n.isPriority);
    if (marked.length === 1) return;
    const targetId = marked[0]?.localId ?? draft.needs[0].localId;
    update(
      "needs",
      draft.needs.map((n) => ({ ...n, isPriority: n.localId === targetId })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.needs]);

  function setPriority(localId: string) {
    update(
      "needs",
      draft.needs.map((n) => ({ ...n, isPriority: n.localId === localId })),
    );
  }

  return (
    <Card className="p-6">
      {eyebrow}
      <h2 className="mt-1 font-display text-2xl font-semibold">
        {title ?? "O que você procura"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {subtitle ?? "Adicione o que faria diferença na sua visita à feira (até 5)."}
      </p>

      {feed.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sugeridos para você (confirme os que fazem sentido)
            </p>
            {aiLoading && (
              <span
                data-testid="ai-personalizing"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin" /> Personalizando sugestões…
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {feed.map((s) => (
              <button
                key={s.identity}
                type="button"
                data-testid="suggestion-chip"
                data-source={s.source}
                onClick={() => addFromFeed(s)}
                disabled={draft.needs.length >= 5}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                + {s.label}
                {s.fromAi && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {AI_SUGGESTION_BADGE}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div>
          <Label>Qual a CATEGORIA daquilo que procura?</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {NEED_KIND_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => setKind(o.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  kind === o.value
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {segmentTax.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Comuns no seu segmento
            </p>
            <div className="flex flex-wrap gap-2">
              {segmentTax.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addFromCatalog(t)}
                  disabled={draft.needs.length >= 5}
                  className="rounded-full border px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Descreva o que procura"
            aria-invalid={label.trim().length === 1}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button
            type="button"
            onClick={addCustom}
            disabled={label.trim().length < 2 || draft.needs.length >= 5}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {label.trim().length === 1 && (
          <p className="mt-1.5 text-sm text-destructive">Descreva com pelo menos 2 caracteres</p>
        )}
      </div>

      <div className="mt-6">
        <p className="mb-1 text-sm font-medium">Suas necessidades ({draft.needs.length}/5)</p>
        <p className="mb-3 text-xs text-muted-foreground">
          <Star className="mr-1 inline h-3.5 w-3.5 text-warning" />
          Marque a prioridade: aquela que, se resolvida, já teria valido sua visita.
        </p>
        {draft.needs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Adicione pelo menos uma necessidade.
          </p>
        ) : (
          <RadioGroup
            value={priorityId}
            onValueChange={setPriority}
            className="space-y-2"
            aria-label="Necessidade prioritária"
          >
            {draft.needs.map((n) => (
              <div
                key={n.localId}
                className={`flex items-center justify-between rounded-lg border bg-card px-3 py-2 ${
                  n.isPriority ? "border-warning/60 bg-warning/5" : ""
                }`}
              >
                <label
                  htmlFor={`p-${n.localId}`}
                  className="flex flex-1 cursor-pointer items-center gap-2"
                >
                  <RadioGroupItem
                    id={`p-${n.localId}`}
                    value={n.localId}
                    aria-label={`Definir ${n.label} como prioridade`}
                  />
                  <Badge variant="secondary">{NEED_LABEL[n.needKind]}</Badge>
                  <span className="text-sm">{n.label}</span>
                  {n.isPriority && <Star className="h-4 w-4 fill-warning text-warning" />}
                </label>
                <button
                  type="button"
                  onClick={() => remove(n.localId)}
                  aria-label={`Remover ${n.label}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </RadioGroup>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {resetAction}
        </div>
        <Button
          onClick={onNext}
          data-testid="needs-continue"
          disabled={draft.needs.length === 0 || !priorityId || nextBlocked}
        >
          Continuar
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepWhoISeek — Etapa 4: "Quem eu procuro" (perfil desejado) + refino das
// necessidades. O bloco de necessidades reaproveita integralmente StepNeeds
// (heurísticas, IA, selo, categoria, itens comuns, manual, prioridade).
// ============================================================================
export function StepWhoISeek({
  draft,
  update,
  onNext,
  onBack,
  catalog,
  eventId,
  aiAnalysis,
  socialContext,
  socialAnalysis,
  resetAction,
}: BaseProps & {
  catalog: EventCatalog;
  resetAction?: ReactNode;
  eventId?: string;
  aiAnalysis?: SharedAiAnalysis;
  socialContext?: SocialBusinessContext | null;
  socialAnalysis?: SocialBusinessAnalysis | null;
}) {
  const targetAnswered = targetProfileAnswered(draft);

  return (
    <div className="space-y-4">
      <Card
        className="border-t-4 border-t-success bg-gradient-to-b from-success/10 to-transparent p-6"
        data-testid="who-i-seek-card"
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success">
          <Target className="h-3.5 w-3.5" aria-hidden="true" /> Etapa 4 · Perfil que quero encontrar
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Quem eu procuro</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Agora descreva o perfil de empresa com quem você quer se conectar.
        </p>

        <div className="mt-6">
          <BusinessProfileCriteria
            mode="target"
            segments={catalog.segments}
            size={draft.targetBusinessSize}
            type={draft.targetBusinessType}
            segmentId={draft.targetSegmentId}
            onSizeChange={(v) => update("targetBusinessSize", v)}
            onTypeChange={(v) => update("targetBusinessType", v)}
            onSegmentChange={(v) => update("targetSegmentId", v)}
            sizeLabel="Porte que procuro"
            typeLabel="Tipo principal que procuro"
            segmentLabel="Segmento que procuro"
            hints={{
              size: "Escolha um porte ou marque Qualquer.",
              type: "Comércio, indústria ou serviço — ou Qualquer.",
              segment: "Setor da empresa que você quer encontrar — ou Qualquer.",
            }}
          />
        </div>

        {!targetAnswered && (
          <p className="mt-5 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Responda os três campos acima. "Qualquer" é uma resposta válida — significa que você não
            tem preferência.
          </p>
        )}
      </Card>

      <StepNeeds
        draft={draft}
        update={update}
        onNext={onNext}
        onBack={onBack}
        catalog={catalog}
        eventId={eventId}
        aiAnalysis={aiAnalysis}
        socialContext={socialContext}
        socialAnalysis={socialAnalysis}
        resetAction={resetAction}
        nextBlocked={!targetAnswered}
        eyebrow={
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Search className="h-3.5 w-3.5" aria-hidden="true" /> Refino
          </p>
        }
        title="Refine o que você procura"
        subtitle="O que faria essa conexão ser ainda mais útil? Adicione até 5 necessidades (elas podem ser de outros segmentos)."
      />
    </div>
  );
}

// A antiga etapa "Prioridade" foi integrada em StepNeeds (etapa "O que eu
// procuro"). O Matcher v2.3 continua consumindo `is_priority` normalmente.

// ============================================================================
// StepReview
// ============================================================================
export function StepReview({
  draft,
  onSubmit,
  onRetryContact,
  onRetryMatch,
  onGoToPanel,
  onGoToIdentity,
  submit,
  mode,
  catalog,
  validation,
  catalogFallback,
  resetAction,
}: {
  draft: WizardDraft;
  resetAction?: ReactNode;
  onBack: () => void;
  onSubmit: () => void;
  onRetryContact: () => void;
  onRetryMatch: () => void;
  onGoToPanel: () => void;
  onGoToIdentity: () => void;
  submit: SubmitState;
  mode: WizardMode;
  catalog: EventCatalog;
  validation: WizardValidation;
  catalogFallback: boolean;
}) {
  const seg = catalog.segments.find((s) => s.id === draft.segmentId);
  // "Qualquer" (ou NULL vindo do banco) é uma resposta explícita, nunca "—".
  const targetSizeText =
    draft.targetBusinessSize && draft.targetBusinessSize !== ANY_PREFERENCE
      ? BUSINESS_SIZE_LABEL[draft.targetBusinessSize]
      : ANY_LABEL;
  const targetTypeText =
    draft.targetBusinessType && draft.targetBusinessType !== ANY_PREFERENCE
      ? BUSINESS_TYPE_LABEL[draft.targetBusinessType]
      : ANY_LABEL;
  const targetSeg = profileSelectableSegments(catalog.segments).find(
    (x) => x.id === draft.targetSegmentId,
  );
  const targetSegmentText =
    draft.targetSegmentId && draft.targetSegmentId !== ANY_PREFERENCE
      ? `${targetSeg?.emoji ?? ""} ${targetSeg?.label ?? draft.targetSegmentId}`.trim()
      : ANY_LABEL;
  const submitting = isSubmitting(submit);
  const canSubmit = reviewIsActionable(submit);
  const validationOk = validation.ok;
  const isPhoneMissing = !validationOk && validation.reason === "phone";
  const validationError = validationOk ? null : validation.message;

  // Requisito: no create, contact_failed NÃO deve oferecer saída ao painel
  // (usuário precisa salvar contato antes de gerar código). No edit também
  // não oferecemos, para consistência com o requisito.
  const contactFailedGoToPanel = undefined;

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-hero-gradient p-6 text-white">
        <div className="absolute inset-0 opacity-25">
          <NetworkGraphic className="h-full w-full" />
        </div>
        <div className="relative">
          <p className="text-xs uppercase tracking-wide text-white/70">Revisão</p>
          <h2 className="font-display text-2xl font-semibold text-white">

            {mode === "edit"
              ? "Confira as alterações"
              : `Tudo certo, ${draft.name.split(" ")[0] || "por aí"}?`}
          </h2>
        </div>
      </div>
      <div className="space-y-5 p-6">
        <ReviewRow label="Empresa" value={draft.company} />
        <ReviewRow
          label="Localização"
          value={[draft.neighborhood, draft.city].filter(Boolean).join(" · ")}
        />
        <section
          className="rounded-xl border-l-4 border-l-secondary bg-secondary/5 p-4"
          data-testid="review-who-i-am"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
            <User className="h-3.5 w-3.5" aria-hidden="true" /> Quem eu sou
          </p>
          <div className="mt-3 space-y-3">
            <ReviewRow
              label="Porte"
              value={draft.businessSize ? BUSINESS_SIZE_LABEL[draft.businessSize] : "—"}
            />
            <ReviewRow
              label="Tipo principal"
              value={draft.businessType ? BUSINESS_TYPE_LABEL[draft.businessType] : "—"}
            />
            <ReviewRow
              label="Segmento"
              value={`${seg?.emoji ?? ""} ${seg?.label ?? (draft.segmentId || "—")}`}
            />
          </div>
        </section>

        <section
          className="rounded-xl border-l-4 border-l-success bg-success/10 p-4"
          data-testid="review-who-i-seek"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success">
            <Target className="h-3.5 w-3.5" aria-hidden="true" /> Quem eu procuro
          </p>
          <div className="mt-3 space-y-3">
            <ReviewRow label="Porte" value={targetSizeText} />
            <ReviewRow label="Tipo principal" value={targetTypeText} />
            <ReviewRow label="Segmento" value={targetSegmentText} />
          </div>
        </section>

        <ReviewRow label="Nicho" value={draft.niche} />
        <ReviewRow label="Resumo" value={draft.summary} />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            O que eu ofereço
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {draft.offers.map((o) => (
              <Badge key={o.localId} variant="secondary">
                {o.label}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            O que eu preciso / procuro
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {draft.needs.map((n) => (
              <li key={n.localId} className="flex items-center gap-2">
                {n.isPriority && <Star className="h-4 w-4 fill-warning text-warning" />}
                <Badge variant="outline">{NEED_LABEL[n.needKind]}</Badge>
                {n.label}
              </li>
            ))}
          </ul>
        </div>

        {catalogFallback && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            Catálogo indisponível. Você está no modo manual — o segmento atual será mantido e novos
            itens serão salvos como "Outro".
          </div>
        )}

        {isPhoneMissing && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="font-medium">Informe novamente seu WhatsApp na etapa de identificação.</p>
            <p className="mt-1 text-muted-foreground">
              Por segurança, ele não fica salvo neste dispositivo.
            </p>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={onGoToIdentity}>
                Ir para identificação
              </Button>
            </div>
          </div>
        )}

        {validationError && !isPhoneMissing && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {validationError}
          </p>
        )}

        {/* Falhas parciais */}
        {submit.stage === "contact_failed" && (
          <PartialFailureBanner
            title="Seu perfil foi salvo, mas o contato não."
            action="Tentar salvar contato novamente"
            onAction={onRetryContact}
            onGoToPanel={contactFailedGoToPanel}
          />
        )}
        {submit.stage === "matching_failed" && (
          <PartialFailureBanner
            title="Seu perfil está salvo. Não conseguimos calcular seus matches agora."
            action="Tentar buscar conexões novamente"
            onAction={onRetryMatch}
            onGoToPanel={onGoToPanel}
          />
        )}
        {submit.stage === "profile_failed" && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Não foi possível salvar seu perfil. Tente novamente.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {resetAction}
          </div>
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={submitting || !canSubmit || !validationOk}
            aria-busy={submitting}
            aria-disabled={submitting || !canSubmit || !validationOk}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                {submit.stage === "saving_profile" && "Salvando perfil…"}
                {submit.stage === "saving_contact" && "Salvando contato…"}
                {submit.stage === "recomputing_matches" && "Buscando conexões…"}
              </>
            ) : mode === "edit" ? (
              "Salvar alterações"
            ) : (
              "Encontrar minhas conexões"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PartialFailureBanner({
  title,
  action,
  onAction,
  onGoToPanel,
}: {
  title: string;
  action: string;
  onAction: () => void;
  onGoToPanel?: () => void;
}) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAction}>
          {action}
        </Button>
        {onGoToPanel && (
          <Button size="sm" variant="outline" onClick={onGoToPanel}>
            Ir ao painel
          </Button>
        )}
      </div>
    </div>
  );
}
