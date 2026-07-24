import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Star, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NetworkGraphic } from "@/components/brand/NetworkGraphic";

import type {
  EventCatalog,
  CatalogTaxonomyItem,
} from "@/features/participant/types";
import type { NeedKind } from "@/lib/types";
import type {
  SubmitState,
  WizardDraft,
  WizardMode,
  WizardNeed,
  WizardOffer,
} from "./types";
import { cryptoUid } from "./draft";
import { heuristicSuggestionProvider } from "./suggestions";
import type { SuggestionItem } from "./types";
import { phoneCreateSchema, phoneEditSchema } from "./schemas";
import { isSubmitting, reviewIsActionable } from "./submitMachine";
import {
  currentPriorityId,
  type WizardValidation,
} from "./validate";

const NEED_KIND_OPTIONS: { value: NeedKind; label: string }[] = [
  { value: "servico", label: "Um serviço" },
  { value: "fornecedor", label: "Um fornecedor" },
  { value: "parceiro", label: "Um parceiro" },
  { value: "compradores", label: "Compradores" },
  { value: "distribuidores", label: "Distribuidores" },
  { value: "profissionais", label: "Profissionais" },
  { value: "produtos", label: "Produtos" },
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
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
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
}: BaseProps & {
  mode: WizardMode;
  phone: string;
  onPhoneChange: (v: string) => void;
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
          : "Suas informações de contato ficam privadas. Só liberamos com interesse mútuo."}
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
          label={
            mode === "edit"
              ? "WhatsApp (opcional — apenas para atualizar)"
              : "WhatsApp"
          }
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
              <span className="mt-1 block text-xs text-destructive">
                {errors.consent}
              </span>
            )}
          </span>
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={handleNext}>
          Continuar
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepSegment
// ============================================================================
export function StepSegment({
  draft,
  update,
  onNext,
  onBack,
  catalog,
  manualMode = false,
  manualSegmentLabel,
}: BaseProps & {
  catalog: EventCatalog;
  manualMode?: boolean;
  manualSegmentLabel?: string;
}) {
  const canNext = !!draft.segmentId && draft.summary.trim().length >= 20;

  function handleSelect(segmentId: string) {
    if (draft.segmentId && draft.segmentId !== segmentId) {
      const prev = draft.segmentId;
      update(
        "offers",
        draft.offers.map((o) =>
          o.segmentId === prev ? { ...o, segmentId } : o,
        ),
      );
      update(
        "needs",
        draft.needs.map((n) =>
          n.segmentId === prev ? { ...n, segmentId } : n,
        ),
      );
    }
    update("segmentId", segmentId);
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">Seu segmento</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {manualMode
          ? "Catálogo indisponível — o segmento atual está bloqueado para edição."
          : "Escolha o segmento principal e escreva um resumo curto do que você faz."}
      </p>

      {manualMode ? (
        <div
          className="mt-6 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm"
          aria-live="polite"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Segmento atual (bloqueado)
          </p>
          <p className="mt-1 font-medium">
            {manualSegmentLabel ?? draft.segmentId}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {catalog.segments.map((s) => {
            const active = draft.segmentId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s.id)}
                aria-pressed={active}
                className={`rounded-xl border p-3 text-left text-sm transition-all ${
                  active
                    ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/30"
                    : "hover:bg-muted"
                }`}
              >
                {s.emoji && <span className="mr-1">{s.emoji}</span>}
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6">
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
          {draft.summary.length}/500 · Mínimo 20 caracteres
        </p>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onNext} disabled={!canNext}>
          Continuar
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
  onBack,
  catalog,
}: BaseProps & { catalog: EventCatalog }) {
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

  function addFromSuggestion(s: SuggestionItem) {
    if (draft.offers.length >= 5) return;
    if (
      draft.offers.some(
        (o) => o.label.toLowerCase() === s.label.toLowerCase(),
      )
    )
      return;
    const offer: WizardOffer = {
      localId: cryptoUid(),
      label: s.label,
      segmentId: draft.segmentId,
      taxonomyItemId: s.taxonomyItemId,
    };
    update("offers", [...draft.offers, offer]);
  }

  function addCustom(label: string) {
    const clean = label.trim();
    if (!clean || draft.offers.length >= 5) return;
    if (
      draft.offers.some((o) => o.label.toLowerCase() === clean.toLowerCase())
    )
      return;
    const offer: WizardOffer = {
      localId: cryptoUid(),
      label: clean,
      segmentId: draft.segmentId,
      taxonomyItemId: null,
    };
    update("offers", [...draft.offers, offer]);
    setCustom("");
  }

  function removeOffer(localId: string) {
    update(
      "offers",
      draft.offers.filter((o) => o.localId !== localId),
    );
  }

  const segmentTax: CatalogTaxonomyItem[] = useMemo(
    () =>
      catalog.taxonomy
        .filter(
          (t) =>
            t.segment_id === draft.segmentId &&
            (t.kind === "offer" || t.kind === "both"),
        )
        .slice(0, 8),
    [catalog, draft.segmentId],
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

      {!loading && suggestions.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sugeridos para você (confirme os que fazem sentido)
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const added = draft.offers.some(
                (o) => o.label.toLowerCase() === s.label.toLowerCase(),
              );
              return (
                <button
                  key={s.label + (s.taxonomyItemId ?? "")}
                  type="button"
                  onClick={() => (added ? null : addFromSuggestion(s))}
                  disabled={added || draft.offers.length >= 5}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-all disabled:opacity-50 ${
                    added
                      ? "border-success bg-success/10"
                      : "hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  {added ? "✓ " : "+ "}
                  {s.label}
                </button>
              );
            })}
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
              const added = draft.offers.some(
                (o) => o.label.toLowerCase() === t.label.toLowerCase(),
              );
              if (added) return null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    addFromSuggestion({
                      taxonomyItemId: t.id,
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

      <div className="mt-6 flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Outro: descreva o que você oferece"
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
          disabled={!custom.trim() || draft.offers.length >= 5}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">
          Seus itens ({draft.offers.length}/5)
        </p>
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
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
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
  onBack,
  catalog,
}: BaseProps & { catalog: EventCatalog }) {
  const [kind, setKind] = useState<NeedKind>("servico");
  const [label, setLabel] = useState("");

  const segmentTax = useMemo(
    () =>
      catalog.taxonomy
        .filter(
          (t) =>
            t.segment_id === draft.segmentId &&
            (t.kind === "need" || t.kind === "both"),
        )
        .slice(0, 10),
    [catalog, draft.segmentId],
  );

  function addFromCatalog(t: CatalogTaxonomyItem) {
    if (draft.needs.length >= 5) return;
    if (
      draft.needs.some((n) => n.label.toLowerCase() === t.label.toLowerCase())
    )
      return;
    const need: WizardNeed = {
      localId: cryptoUid(),
      label: t.label,
      segmentId: draft.segmentId,
      taxonomyItemId: t.id,
      needKind: kind,
      isPriority: false,
    };
    update("needs", [...draft.needs, need]);
  }

  function addCustom() {
    const clean = label.trim();
    if (!clean || draft.needs.length >= 5) return;
    const need: WizardNeed = {
      localId: cryptoUid(),
      label: clean,
      segmentId: draft.segmentId,
      taxonomyItemId: null,
      needKind: kind,
      isPriority: false,
    };
    update("needs", [...draft.needs, need]);
    setLabel("");
  }

  function remove(localId: string) {
    update(
      "needs",
      draft.needs.filter((n) => n.localId !== localId),
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">O que você procura</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Adicione o que faria diferença na sua visita à feira (até 5).
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <Label>Categoria</Label>
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
            placeholder="Outro: descreva o que procura"
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
            disabled={!label.trim() || draft.needs.length >= 5}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">
          Suas necessidades ({draft.needs.length}/5)
        </p>
        {draft.needs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Adicione pelo menos uma necessidade.
          </p>
        ) : (
          <ul className="space-y-2">
            {draft.needs.map((n) => (
              <li
                key={n.localId}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{NEED_LABEL[n.needKind]}</Badge>
                  <span className="text-sm">{n.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.localId)}
                  aria-label={`Remover ${n.label}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onNext} disabled={draft.needs.length === 0}>
          Continuar
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepPriority
// ============================================================================
export function StepPriority({ draft, update, onNext, onBack }: BaseProps) {
  const priorityId = currentPriorityId(draft);
  const hasPriority = priorityId !== "";
  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">
        <Star className="mr-1 inline h-6 w-6 text-warning" />
        Qual é a prioridade?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Marque a necessidade que, se resolvida, já teria valido sua visita.
      </p>

      <RadioGroup
        value={priorityId}
        onValueChange={(v) => {
          update(
            "needs",
            draft.needs.map((n) => ({ ...n, isPriority: n.localId === v })),
          );
        }}
        className="mt-6 space-y-2"
      >
        {draft.needs.map((n) => (
          <label
            key={n.localId}
            htmlFor={`p-${n.localId}`}
            className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40"
          >
            <RadioGroupItem id={`p-${n.localId}`} value={n.localId} />
            <div>
              <Badge variant="secondary">{NEED_LABEL[n.needKind]}</Badge>
              <span className="ml-2 text-sm">{n.label}</span>
            </div>
          </label>
        ))}
      </RadioGroup>

      {!hasPriority && (
        <p className="mt-3 text-xs text-muted-foreground">
          Escolha uma prioridade para continuar.
        </p>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onNext} disabled={!hasPriority}>
          Continuar
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// StepReview
// ============================================================================
export function StepReview({
  draft,
  onBack,
  onSubmit,
  onRetryContact,
  onRetryCode,
  onRetryMatch,
  onGoToPanel,
  onGoToIdentity,
  submit,
  mode,
  catalog,
  validation,
  catalogFallback,
}: {
  draft: WizardDraft;
  onBack: () => void;
  onSubmit: () => void;
  onRetryContact: () => void;
  onRetryCode: () => void;
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
      <div className="relative bg-hero-gradient p-6 text-primary-foreground">
        <div className="absolute inset-0 opacity-25">
          <NetworkGraphic className="h-full w-full" />
        </div>
        <div className="relative">
          <p className="text-xs uppercase tracking-wide text-white/70">Revisão</p>
          <h2 className="font-display text-2xl font-semibold">
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
        <ReviewRow
          label="Segmento"
          value={`${seg?.emoji ?? ""} ${seg?.label ?? (draft.segmentId || "—")}`}
        />
        <ReviewRow label="Resumo" value={draft.summary} />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ofereço
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
            Procuro
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {draft.needs.map((n) => (
              <li key={n.localId} className="flex items-center gap-2">
                {n.isPriority && (
                  <Star className="h-4 w-4 fill-warning text-warning" />
                )}
                <Badge variant="outline">{NEED_LABEL[n.needKind]}</Badge>
                {n.label}
              </li>
            ))}
          </ul>
        </div>

        {catalogFallback && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            Catálogo indisponível. Você está no modo manual — o segmento atual
            será mantido e novos itens serão salvos como "Outro".
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
        {submit.stage === "code_failed" && (
          <PartialFailureBanner
            title="Perfil salvo. Não foi possível gerar o código de recuperação."
            action="Gerar código novamente"
            onAction={onRetryCode}
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
          <Button variant="outline" onClick={onBack} disabled={submitting}>
            Voltar e editar
          </Button>
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
                {submit.stage === "generating_code" && "Gerando código…"}
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
