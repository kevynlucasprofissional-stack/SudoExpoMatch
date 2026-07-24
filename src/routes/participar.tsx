import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/brand/BrandShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecoveryCodeDialog } from "@/components/RecoveryCodeDialog";

import { EVENT_ID } from "@/lib/mock-data";
import { useEnsureParticipantSession } from "@/features/participant/session";
import { useEventTaxonomy } from "@/features/taxonomy/queries";
import { useOwnProfile } from "@/features/participant/useOwnProfile";
import {
  ApiError,
  saveOwnProfile,
  setOwnContact,
  rotateOwnRecoveryCode,
} from "@/features/participant/api";
import { recomputeOwnMatches } from "@/features/matching/api";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/features/participant/queryKeys";

import type { WizardDraft, WizardMode } from "@/features/onboarding/types";
import {
  clearWizardDraft,
  createEmptyDraft,
  loadWizardDraft,
  purgeLegacyDraft,
  saveWizardDraft,
} from "@/features/onboarding/draft";
import {
  mapProfileToWizardDraft,
  mapWizardToSaveProfileInput,
  normalizePhoneE164,
  WizardMappingError,
} from "@/features/onboarding/mappers";
import {
  initialSubmitState,
  isSubmitting,
  submitReducer,
} from "@/features/onboarding/submitMachine";
import {
  StepIdentity,
  StepSegment,
  StepOffers,
  StepNeeds,
  StepPriority,
  StepReview,
} from "@/features/onboarding/steps";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

function WizardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useEnsureParticipantSession();

  const catalogQuery = useEventTaxonomy(EVENT_ID, { enabled: session.isReady });
  const profileQuery = useOwnProfile(EVENT_ID, { enabled: session.isReady });

  const [draft, setDraft] = useState<WizardDraft>(() => createEmptyDraft());
  const [phone, setPhone] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<WizardMode>("create");
  const [showConflict, setShowConflict] = useState(false);
  const [submit, dispatch] = useReducer(submitReducer, initialSubmitState());

  const runningRef = useRef(false);

  // ------------------------------------------------------------------
  // Hidratação de rascunho + perfil (conflito controlado)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!session.isReady) return;
    if (profileQuery.isPending) return;
    if (hydrated) return;
    purgeLegacyDraft();
    const loaded = loadWizardDraft();
    const hasProfile = !!profileQuery.data;

    if (hasProfile && loaded) {
      // Conflito: aguarda escolha explícita.
      setDraft(loaded.draft);
      setMode("edit");
      setShowConflict(true);
      setHydrated(true);
      return;
    }
    if (hasProfile && !loaded) {
      setDraft(mapProfileToWizardDraft(profileQuery.data!));
      setMode("edit");
      setHydrated(true);
      return;
    }
    if (!hasProfile && loaded) {
      setDraft(loaded.draft);
      setMode("create");
      setHydrated(true);
      return;
    }
    setDraft(createEmptyDraft());
    setMode("create");
    setHydrated(true);
  }, [session.isReady, profileQuery.isPending, profileQuery.data, hydrated]);

  // Persistência: só depois de hidratado e antes da conclusão.
  useEffect(() => {
    if (!hydrated) return;
    if (submit.stage === "completed") return;
    saveWizardDraft(draft);
  }, [draft, hydrated, submit.stage]);

  function update<K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function next() {
    setDraft((d) => ({ ...d, step: Math.min(d.step + 1, STEPS.length - 1) }));
  }
  function back() {
    setDraft((d) => ({ ...d, step: Math.max(d.step - 1, 0) }));
  }

  // ------------------------------------------------------------------
  // Conflito rascunho x perfil
  // ------------------------------------------------------------------
  function loadServerProfile() {
    if (!profileQuery.data) return;
    clearWizardDraft();
    setDraft(mapProfileToWizardDraft(profileQuery.data));
    setMode("edit");
    setShowConflict(false);
  }
  function continueDraft() {
    // Rascunho preservado, mas como o perfil já existe permanecemos em edição.
    setMode("edit");
    setShowConflict(false);
  }

  // ------------------------------------------------------------------
  // Máquina de submit — orquestração de fases
  // ------------------------------------------------------------------
  const startSubmit = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const phoneE164 = phone.trim() ? normalizePhoneE164(phone) : null;
      const withContact = mode === "create" ? true : !!phoneE164;
      dispatch({ type: "START", mode, withContact });

      try {
        const input = mapWizardToSaveProfileInput(draft, EVENT_ID);
        await saveOwnProfile(input);
      } catch (err) {
        dispatch({ type: "PROFILE_FAIL" });
        toast.error(errorToUserMessage(err, "Não foi possível salvar seu perfil."));
        return;
      }
      qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
      dispatch({ type: "PROFILE_OK" });

      if (mode === "create" || (mode === "edit" && phoneE164)) {
        try {
          await setOwnContact({ phone_e164: phoneE164!, sharing: true });
        } catch (err) {
          dispatch({ type: "CONTACT_FAIL" });
          toast.error(errorToUserMessage(err, "Perfil salvo, contato não."));
          return;
        }
        dispatch({ type: "CONTACT_OK" });
      }

      if (mode === "create") {
        try {
          const code = await rotateOwnRecoveryCode();
          dispatch({ type: "CODE_OK", code });
          return; // aguarda “Já salvei”
        } catch (err) {
          dispatch({ type: "CODE_FAIL" });
          toast.error(errorToUserMessage(err, "Não gerou código."));
          return;
        }
      }

      // Edição: pula direto para matching
      await runRecompute();
    } finally {
      runningRef.current = false;
    }
  }, [draft, mode, phone, qc]);

  const runRecompute = useCallback(async () => {
    try {
      await recomputeOwnMatches(EVENT_ID);
      qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
      dispatch({ type: "MATCH_OK" });
      clearWizardDraft();
      toast.success(
        mode === "edit" ? "Alterações salvas!" : "Perfil criado! Buscando conexões…",
      );
      navigate({ to: "/participante" });
    } catch (err) {
      dispatch({ type: "MATCH_FAIL" });
      toast.error(
        errorToUserMessage(err, "Não conseguimos calcular seus matches agora."),
      );
    }
  }, [mode, navigate, qc]);

  const retryContact = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      dispatch({ type: "RETRY_CONTACT" });
      const phoneE164 = normalizePhoneE164(phone);
      if (!phoneE164) {
        dispatch({ type: "CONTACT_FAIL" });
        toast.error("WhatsApp inválido.");
        return;
      }
      try {
        await setOwnContact({ phone_e164: phoneE164, sharing: true });
      } catch (err) {
        dispatch({ type: "CONTACT_FAIL" });
        toast.error(errorToUserMessage(err, "Contato ainda não foi salvo."));
        return;
      }
      dispatch({ type: "CONTACT_OK" });
      if (mode === "create") {
        try {
          const code = await rotateOwnRecoveryCode();
          dispatch({ type: "CODE_OK", code });
        } catch (err) {
          dispatch({ type: "CODE_FAIL" });
          toast.error(errorToUserMessage(err, "Não gerou código."));
        }
      } else {
        await runRecompute();
      }
    } finally {
      runningRef.current = false;
    }
  }, [phone, mode, runRecompute]);

  const retryCode = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      dispatch({ type: "RETRY_CODE" });
      try {
        const code = await rotateOwnRecoveryCode();
        dispatch({ type: "CODE_OK", code });
      } catch (err) {
        dispatch({ type: "CODE_FAIL" });
        toast.error(errorToUserMessage(err, "Não gerou código."));
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  const retryMatch = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      dispatch({ type: "RETRY_MATCH" });
      await runRecompute();
    } finally {
      runningRef.current = false;
    }
  }, [runRecompute]);

  const codeConfirmed = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      dispatch({ type: "CODE_CONFIRMED" });
      await runRecompute();
    } finally {
      runningRef.current = false;
    }
  }, [runRecompute]);

  const goToPanel = useCallback(() => {
    clearWizardDraft();
    navigate({ to: "/participante" });
  }, [navigate]);

  // ------------------------------------------------------------------
  // Guardas de renderização
  // ------------------------------------------------------------------
  if (session.status === "loading" || !hydrated) {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </section>
      </PageShell>
    );
  }
  if (session.status === "error") {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Sessão indisponível</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Não foi possível iniciar sua sessão. Verifique sua internet.
            </p>
            <Button className="mt-4" onClick={() => void session.retry()}>
              Tentar novamente
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }
  if (catalogQuery.isPending) {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12 space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
        </section>
      </PageShell>
    );
  }
  if (catalogQuery.isError || !catalogQuery.data) {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Catálogo indisponível</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Não conseguimos carregar segmentos e taxonomia do evento.
            </p>
            <Button className="mt-4" onClick={() => void catalogQuery.refetch()}>
              Tentar novamente
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  const catalog = catalogQuery.data;
  const step = draft.step;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8">
        {mode === "edit" && !showConflict && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            Você está editando seu perfil.
          </div>
        )}

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
          <StepIdentity
            draft={draft}
            update={update}
            onNext={next}
            mode={mode}
            phone={phone}
            onPhoneChange={setPhone}
          />
        )}
        {step === 1 && (
          <StepSegment
            draft={draft}
            update={update}
            onNext={next}
            onBack={back}
            catalog={catalog}
          />
        )}
        {step === 2 && (
          <StepOffers
            draft={draft}
            update={update}
            onNext={next}
            onBack={back}
            catalog={catalog}
          />
        )}
        {step === 3 && (
          <StepNeeds
            draft={draft}
            update={update}
            onNext={next}
            onBack={back}
            catalog={catalog}
          />
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
          <StepReview
            draft={draft}
            onBack={back}
            onSubmit={() => void startSubmit()}
            onRetryContact={() => void retryContact()}
            onRetryCode={() => void retryCode()}
            onRetryMatch={() => void retryMatch()}
            onGoToPanel={goToPanel}
            submit={submit}
            mode={mode}
            catalog={catalog}
          />
        )}
      </section>

      <RecoveryCodeDialog
        open={submit.stage === "awaiting_code_confirmation"}
        code={submit.recoveryCode}
        onConfirm={() => void codeConfirmed()}
      />

      <AlertDialog open={showConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você já tem um perfil neste evento</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos um rascunho salvo neste dispositivo. O que deseja fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={continueDraft}>
              Continuar rascunho
            </AlertDialogCancel>
            <AlertDialogAction onClick={loadServerProfile}>
              Carregar meu perfil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function errorToUserMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "invalid_input":
        return "Dados inválidos. Confira os campos.";
      case "field_too_long":
        return "Algum campo passou do limite de caracteres.";
      case "invalid_segment":
        return "Segmento inválido.";
      case "invalid_offers_count":
        return "Você precisa ter entre 1 e 5 ofertas.";
      case "invalid_needs_count":
        return "Você precisa ter entre 1 e 5 necessidades.";
      case "consent_required":
        return "É preciso aceitar o consentimento.";
      case "event_not_active":
        return "O evento não está ativo.";
      case "sign_in_failed":
      case "not_authenticated":
        return "Sessão expirada. Recarregue a página.";
      case "rate_limited":
        return "Muitas tentativas. Aguarde alguns minutos.";
      case "network":
        return "Sem conexão. Verifique sua internet.";
      default:
        return fallback;
    }
  }
  if (err instanceof WizardMappingError) {
    if (err.code === "single_priority_required")
      return "Marque exatamente uma prioridade.";
    return "Revise os campos do formulário.";
  }
  return fallback;
}

// Wizard-side helper — kept exported for tests.
export { isSubmitting };
