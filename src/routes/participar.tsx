import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";

import { PageShell } from "@/components/brand/BrandShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NetworkGraphic } from "@/components/brand/NetworkGraphic";
import { RecoveryCodeDialog } from "@/components/RecoveryCodeDialog";

import { NEED_KIND_LABELS, SEGMENTS, TAXONOMY } from "@/lib/mock-data";
import { store } from "@/lib/store";
import { suggestFromSummary, type AISuggestion } from "@/domains/ai/mock";
import type { NeedItem, NeedKind, OfferItem, Profile } from "@/lib/types";
import { Loader2, Plus, Sparkles, Star, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/participar")({
  head: () => ({
    meta: [
      { title: "Participar — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Crie seu perfil profissional em minutos e receba conexões relevantes na SudoExpo.",
      },
      { property: "og:title", content: "Participar — Matchmaker SudoExpo" },
      {
        property: "og:description",
        content: "Wizard rápido para encontrar suas conexões na feira.",
      },
    ],
  }),
  component: WizardPage,
});

const STEPS = [
  "Identificação",
  "Segmento",
  "Ofertas",
  "Necessidades",
  "Prioridade",
  "Revisão",
] as const;

const DRAFT_KEY = "sudoexpo:draft";

interface Draft {
  name: string;
  company: string;
  whatsapp: string;
  city: string;
  neighborhood: string;
  consent: boolean;
  segmentId: string;
  summary: string;
  offers: OfferItem[];
  needs: NeedItem[];
}

const emptyDraft = (): Draft => ({
  name: "",
  company: "",
  whatsapp: "",
  city: "",
  neighborhood: "",
  consent: false,
  segmentId: "",
  summary: "",
  offers: [],
  needs: [],
});

function loadDraft(): Draft {
  if (typeof window === "undefined") return emptyDraft();
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? { ...emptyDraft(), ...JSON.parse(raw) } : emptyDraft();
  } catch {
    return emptyDraft();
  }
}

function saveDraft(d: Draft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
}

const identitySchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome"),
  company: z.string().trim().min(2, "Informe sua empresa"),
  whatsapp: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, "WhatsApp inválido"),
  city: z.string().trim().min(2, "Informe sua cidade"),
  neighborhood: z.string().trim().max(80).optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar" }) }),
});

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function WizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [hydrated, setHydrated] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveDraft(draft);
  }, [draft, hydrated]);

  const progress = ((step + 1) / STEPS.length) * 100;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const profileData: Omit<
      Profile,
      "id" | "createdAt" | "updatedAt" | "recoveryCode" | "eventId"
    > = {
      name: draft.name.trim(),
      company: draft.company.trim(),
      city: draft.city.trim(),
      neighborhood: draft.neighborhood.trim() || undefined,
      whatsapp: draft.whatsapp.trim(),
      segmentId: draft.segmentId,
      summary: draft.summary.trim(),
      offers: draft.offers,
      needs: draft.needs,
      consent: draft.consent,
    };
    try {
      const profile = await store.createProfile(profileData);
      store.session.set(profile.id);
      if (typeof window !== "undefined") window.localStorage.removeItem(DRAFT_KEY);
      // Exige que o usuário confirme que salvou o código antes de avançar.
      if (profile.recoveryCode) {
        setRecoveryCode(profile.recoveryCode);
      } else {
        toast.success("Perfil criado! Buscando conexões…");
        navigate({ to: "/participante" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Não foi possível salvar seu perfil: ${msg}`);
    }
  }

  function confirmCodeSaved() {
    // Consome do storage e navega apenas após confirmação do usuário.
    store.consumeLastRecoveryCode();
    setRecoveryCode(null);
    toast.success("Perfil criado! Buscando conexões…");
    navigate({ to: "/participante" });
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Etapa {step + 1} de {STEPS.length}
            </span>
            <span>{STEPS[step]}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {step === 0 && (
          <StepIdentity draft={draft} update={update} onNext={next} />
        )}
        {step === 1 && (
          <StepSegment draft={draft} update={update} onNext={next} onBack={back} />
        )}
        {step === 2 && (
          <StepOffers draft={draft} update={update} onNext={next} onBack={back} />
        )}
        {step === 3 && (
          <StepNeeds draft={draft} update={update} onNext={next} onBack={back} />
        )}
        {step === 4 && (
          <StepPriority
            draft={draft}
            update={update}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 5 && (
          <StepReview draft={draft} onBack={back} onSubmit={submit} />
        )}
      </section>

      <RecoveryCodeDialog
        open={recoveryCode !== null}
        code={recoveryCode}
        onConfirm={confirmCodeSaved}
      />
    </PageShell>
  );
}

// ------------------------------------------------------------------
// Steps
// ------------------------------------------------------------------

interface StepProps {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  onNext: () => void;
  onBack?: () => void;
}

function StepIdentity({ draft, update, onNext }: StepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleNext() {
    const parsed = identitySchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[String(issue.path[0])] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    onNext();
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">Vamos nos conhecer</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Suas informações de contato ficam privadas. Só liberamos com interesse mútuo.
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
        <Field label="WhatsApp" error={errors.whatsapp}>
          <Input
            value={draft.whatsapp}
            onChange={(e) => update("whatsapp", e.target.value)}
            placeholder="(64) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
          />
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

function StepSegment({ draft, update, onNext, onBack }: StepProps) {
  const canNext = !!draft.segmentId && draft.summary.trim().length >= 20;
  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">Seu segmento</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha o segmento principal e escreva um resumo curto do que você faz.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SEGMENTS.map((s) => {
          const active = draft.segmentId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => update("segmentId", s.id)}
              aria-pressed={active}
              className={`rounded-xl border p-3 text-left text-sm transition-all ${
                active
                  ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/30"
                  : "hover:bg-muted"
              }`}
            >
              <span className="mr-1">{s.emoji}</span>
              {s.label}
            </button>
          );
        })}
      </div>

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

function StepOffers({ draft, update, onNext, onBack }: StepProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    suggestFromSummary(draft.summary).then((s) => {
      if (cancelled) return;
      setSuggestion(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.summary]);

  function addOffer(label: string) {
    if (!label.trim() || draft.offers.length >= 5) return;
    if (draft.offers.some((o) => o.label.toLowerCase() === label.toLowerCase()))
      return;
    update("offers", [...draft.offers, { id: uid(), label: label.trim() }]);
  }

  function removeOffer(id: string) {
    update("offers", draft.offers.filter((o) => o.id !== id));
  }

  const segmentTax = useMemo(
    () => TAXONOMY.filter((t) => t.segmentId === draft.segmentId).slice(0, 8),
    [draft.segmentId],
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
          <Loader2 className="h-4 w-4 animate-spin" /> Analisando seu resumo com IA…
        </div>
      )}

      {suggestion && !loading && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sugeridos para você (confirme os que fazem sentido)
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestion.offers.map((label) => {
              const added = draft.offers.some(
                (o) => o.label.toLowerCase() === label.toLowerCase(),
              );
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => (added ? null : addOffer(label))}
                  disabled={added || draft.offers.length >= 5}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-all disabled:opacity-50 ${
                    added
                      ? "border-success bg-success/10"
                      : "hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  {added ? "✓ " : "+ "}
                  {label}
                </button>
              );
            })}
          </div>
          {segmentTax.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                      onClick={() => addOffer(t.label)}
                      disabled={draft.offers.length >= 5}
                      className="rounded-full border px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      + {t.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
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
              addOffer(custom);
              setCustom("");
            }
          }}
        />
        <Button
          type="button"
          onClick={() => {
            addOffer(custom);
            setCustom("");
          }}
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
                key={o.id}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
              >
                <span className="text-sm">{o.label}</span>
                <button
                  type="button"
                  onClick={() => removeOffer(o.id)}
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

function StepNeeds({ draft, update, onNext, onBack }: StepProps) {
  const [kind, setKind] = useState<NeedKind>("servico");
  const [label, setLabel] = useState("");

  function add() {
    if (!label.trim()) return;
    update("needs", [
      ...draft.needs,
      { id: uid(), kind, label: label.trim() },
    ]);
    setLabel("");
  }

  function remove(id: string) {
    update("needs", draft.needs.filter((n) => n.id !== id));
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-2xl font-semibold">O que você procura</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Adicione o que faria diferença na sua visita à feira.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <Label>Categoria</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(NEED_KIND_LABELS).map(([k, v]) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k as NeedKind)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  kind === k
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex.: fornecedor de embalagens"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" onClick={add} disabled={!label.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">
          Suas necessidades ({draft.needs.length})
        </p>
        {draft.needs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Adicione pelo menos uma necessidade.
          </p>
        ) : (
          <ul className="space-y-2">
            {draft.needs.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{NEED_KIND_LABELS[n.kind]}</Badge>
                  <span className="text-sm">{n.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
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

function StepPriority({ draft, update, onNext, onBack }: StepProps) {
  const priorityId =
    draft.needs.find((n) => n.isPriority)?.id ?? draft.needs[0]?.id ?? "";
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
            draft.needs.map((n) => ({ ...n, isPriority: n.id === v })),
          );
        }}
        className="mt-6 space-y-2"
      >
        {draft.needs.map((n) => (
          <label
            key={n.id}
            htmlFor={`p-${n.id}`}
            className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40"
          >
            <RadioGroupItem id={`p-${n.id}`} value={n.id} />
            <div>
              <Badge variant="secondary">{NEED_KIND_LABELS[n.kind]}</Badge>
              <span className="ml-2 text-sm">{n.label}</span>
            </div>
          </label>
        ))}
      </RadioGroup>

      <div className="mt-6 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onNext}>Continuar</Button>
      </div>
    </Card>
  );
}

function StepReview({
  draft,
  onBack,
  onSubmit,
}: {
  draft: Draft;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const seg = SEGMENTS.find((s) => s.id === draft.segmentId);
  return (
    <Card className="overflow-hidden">
      <div className="relative bg-hero-gradient p-6 text-primary-foreground">
        <div className="absolute inset-0 opacity-25">
          <NetworkGraphic className="h-full w-full" />
        </div>
        <div className="relative">
          <p className="text-xs uppercase tracking-wide text-white/70">Revisão</p>
          <h2 className="font-display text-2xl font-semibold">
            Tudo certo, {draft.name.split(" ")[0]}?
          </h2>
        </div>
      </div>
      <div className="space-y-5 p-6">
        <ReviewRow label="Empresa" value={draft.company} />
        <ReviewRow
          label="Localização"
          value={[draft.neighborhood, draft.city].filter(Boolean).join(" · ")}
        />
        <ReviewRow label="Segmento" value={`${seg?.emoji ?? ""} ${seg?.label ?? "—"}`} />
        <ReviewRow label="Resumo" value={draft.summary} />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ofereço
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {draft.offers.map((o) => (
              <Badge key={o.id} variant="secondary">
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
              <li key={n.id} className="flex items-center gap-2">
                {n.isPriority && (
                  <Star className="h-4 w-4 fill-warning text-warning" />
                )}
                <Badge variant="outline">{NEED_KIND_LABELS[n.kind]}</Badge>
                {n.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onBack} disabled={submitting}>
            Voltar e editar
          </Button>
          <Button
            size="lg"
            onClick={() => {
              setSubmitting(true);
              onSubmit();
            }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando conexões…
              </>
            ) : (
              "Encontrar minhas conexões"
            )}
          </Button>
        </div>
      </div>
    </Card>
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

function Field({
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
