import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, RotateCcw, TestTube2 } from "lucide-react";

import { analyzeSocialProfile } from "@/lib/social-context.functions";
import { socialLookupMessage } from "@/lib/social-context";
import { shouldRunSocialEnrichment } from "@/features/onboarding/socialContinue";
import type { SocialEnrichmentResult } from "@/lib/social-enrichment";
import type { SocialLookupUiState } from "@/features/onboarding/steps";


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

import { EVENT_ID } from "@/config/event";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  useEnsureParticipantSession,
  resetParticipantSession,
} from "@/features/participant/session";
import { track } from "@/features/analytics/track";
import { useEventTaxonomy } from "@/features/taxonomy/queries";
import { useOwnProfile } from "@/features/participant/useOwnProfile";
import {
  ApiError,
  saveOwnProfile,
  linkOwnSocialProfile,
  getOwnSocialProfile,
  setOwnContact,
} from "@/features/participant/api";
import { recomputeOwnMatches } from "@/features/matching/api";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/features/participant/queryKeys";

import type { EventCatalog } from "@/features/participant/types";
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
  StepWhoIAm,
  StepOffers,
  StepWhoISeek,
  StepReview,
} from "@/features/onboarding/steps";
import { useSharedAiAnalysis } from "@/features/onboarding/aiAnalysisState";
import { validateWizardForSubmit } from "@/features/onboarding/validate";
import { canonicalizeDraftItems } from "@/features/onboarding/canonicalizeItems";
import { resolveCatalogAvailability } from "@/features/onboarding/catalogAvailability";
import { resolveWizardPageState } from "@/features/onboarding/pageState";
import { runWizardReset, WIZARD_RESET_COPY } from "@/features/onboarding/wizardReset";
import {
  runWizardSubmit,
  shouldRecomputeAfterContactRetry,
} from "@/features/onboarding/submitOrchestrator";

export const participarSearchSchema = z.object({
  event: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/participar")({
  validateSearch: zodValidator(participarSearchSchema),
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
  "Quem eu sou",
  "O que eu ofereço",
  "Quem eu procuro",
  "Revisão",
] as const;

function WizardPage() {
  const search = Route.useSearch();
  const targetEventId = search.event ? search.event : EVENT_ID;
  const isSandbox = targetEventId === "sandbox-sudoexpo";

  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useEnsureParticipantSession();

  const catalogQuery = useEventTaxonomy(targetEventId, { enabled: session.isReady });
  const profileQuery = useOwnProfile(targetEventId, { enabled: session.isReady });

  const [draft, setDraft] = useState<WizardDraft>(() => createEmptyDraft());
  const [phone, setPhone] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<WizardMode>("create");
  const [showConflict, setShowConflict] = useState(false);
  const [showPhoneConfirm, setShowPhoneConfirm] = useState(false);
  const [submit, dispatch] = useReducer(submitReducer, initialSubmitState());

  const runningRef = useRef(false);

  // ------------------------------------------------------------------
  // Hidratação — só quando sessão pronta E perfil resolvido com sucesso.
  // Se profileQuery falhar, NÃO hidrata (evita "usuário novo" fantasma).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!session.isReady) return;
    if (profileQuery.isPending) return;
    if (profileQuery.isError) return;
    if (hydrated) return;
    purgeLegacyDraft();
    const loaded = loadWizardDraft();
    const hasProfile = !!profileQuery.data;

    if (hasProfile && loaded) {
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
  }, [session.isReady, profileQuery.isPending, profileQuery.isError, profileQuery.data, hydrated]);

  // Analytics do funil: início e conclusão do cadastro (sem PII).
  // Sempre no evento efetivo (`targetEventId`) para não contaminar as métricas
  // da feira real com cadastros de sandbox / outros eventos.
  useEffect(() => {
    if (!hydrated) return;
    track({
      kind: "onboarding_started",
      eventId: targetEventId,
      payload: { source: mode },
      dedupeKey: `onboarding_started:${targetEventId}:${mode}`,
    });
  }, [hydrated, mode, targetEventId]);

  useEffect(() => {
    if (submit.stage !== "completed") return;
    track({
      kind: "onboarding_completed",
      eventId: targetEventId,
      payload: { source: mode, segment_id: draft.segmentId || undefined },
      dedupeKey: `onboarding_completed:${targetEventId}`,
    });
  }, [submit.stage, mode, draft.segmentId, targetEventId]);

  // Persistência: apenas depois de hidratado e antes de completar.
  useEffect(() => {
    if (!hydrated) return;
    if (submit.stage === "completed") return;
    saveWizardDraft(draft);
  }, [draft, hydrated, submit.stage]);

  function update<K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  const aiAnalysis = useSharedAiAnalysis();
  const analyzeSocial = useServerFn(analyzeSocialProfile);
  const [social, setSocial] = useState<SocialLookupUiState>({
    status: "idle",
    result: null,
    message: "",
  });
  const socialGen = useRef(0);
  const socialRehydrated = useRef<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  /**
   * Enriquecimento opcional: qualquer falha vira mensagem informativa e o
   * cadastro segue normalmente (nunca bloqueia o wizard).
   */
  const runSocialEnrich = useCallback(
    async (raw: string): Promise<void> => {
      const value = raw.trim();
      if (!value) return;
      const gen = ++socialGen.current;
      setSocial({ status: "loading", result: null, message: "Preparando suas sugestões…" });
      let result: SocialEnrichmentResult;
      try {
        result = await analyzeSocial({ data: { input: value } });
      } catch {
        result = { status: "unavailable", reason: "error" };
      }
      if (gen !== socialGen.current) return;
      if (result.status === "ok") {
        setDraft((d) => ({ ...d, instagram: `@${result.context.handle}` }));
      }
      setSocial({ status: "done", result, message: socialLookupMessage(result) });
    },
    [analyzeSocial],
  );

  /**
   * "Continuar" da etapa 2: se houver `@`, o enriquecimento roda de forma
   * transparente antes de avançar. Nenhuma falha bloqueia o cadastro e o
   * mesmo `@` já resolvido não dispara nova consulta (cache local + L1/L2).
   */
  const socialBusy = useRef(false);
  const continueFromWhoIAm = useCallback(async () => {
    if (socialBusy.current) return; // anti double-click
    const raw = draft.instagram?.trim() ?? "";
    const resolved =
      social.status === "done" && social.result?.status === "ok"
        ? social.result.context.handle
        : null;
    if (shouldRunSocialEnrichment(raw, resolved)) {
      socialBusy.current = true;
      try {
        await runSocialEnrich(raw);
      } finally {
        socialBusy.current = false;
      }
    }
    next();
  }, [draft.instagram, runSocialEnrich, social]);



  /**
   * Reload durante o preenchimento: o `@` sobrevive no rascunho local, então
   * reidratamos o contexto social a partir do cache persistente do backend.
   * `cacheOnly` garante zero chamadas ao Instagram e zero tokens de IA.
   */
  useEffect(() => {
    if (!hydrated) return;
    const handle = draft.instagram?.trim();
    if (!handle) return;
    if (social.status !== "idle") return;
    if (socialRehydrated.current === handle) return;
    socialRehydrated.current = handle;
    const gen = ++socialGen.current;
    void (async () => {
      let result: SocialEnrichmentResult;
      try {
        result = await analyzeSocial({ data: { input: handle, cacheOnly: true } });
      } catch {
        return;
      }
      if (gen !== socialGen.current) return;
      if (result.status !== "ok") return; // sem cache: usuário pode reanalisar
      setSocial({ status: "done", result, message: socialLookupMessage(result) });
    })();
  }, [hydrated, draft.instagram, social.status, analyzeSocial]);

  /**
   * "Resetar formulário": só executa após confirmação explícita. Não apaga o
   * perfil já salvo no backend nem o cache social global do handle.
   */
  const confirmReset = useCallback(async () => {
    setShowReset(false);
    socialGen.current += 1;
    socialRehydrated.current = null;
    await runWizardReset({
      setDraft,
      setPhone,
      resetSocial: () => setSocial({ status: "idle", result: null, message: "" }),
      resetAi: aiAnalysis.reset,
      resetSubmit: () => dispatch({ type: "RESET" }),
      clearQueryCache: () => qc.clear(),
      resetSession: resetParticipantSession,
    });
    setMode("create");
    setShowConflict(false);
    setShowPhoneConfirm(false);
    toast.success("Formulário limpo. Pode começar um novo cadastro.");
  }, [aiAnalysis.reset, qc]);

  function next() {
    setDraft((d) => ({ ...d, step: Math.min(d.step + 1, STEPS.length - 1) }));
  }
  function back() {
    setDraft((d) => ({ ...d, step: Math.max(d.step - 1, 0) }));
  }
  const goToIdentity = useCallback(() => {
    setDraft((d) => ({ ...d, step: 0 }));
  }, []);
  /** Etapa "O que eu ofereço". */
  const goToOffers = useCallback(() => {
    setDraft((d) => ({ ...d, step: 2 }));
  }, []);
  /** Etapa "Quem eu procuro". */
  const goToNeeds = useCallback(() => {
    setDraft((d) => ({ ...d, step: 3 }));
  }, []);

  function loadServerProfile() {
    if (!profileQuery.data) return;
    clearWizardDraft();
    setDraft(mapProfileToWizardDraft(profileQuery.data));
    setMode("edit");
    setShowConflict(false);
    // Instagram fica em estrutura privada própria: recupera o vínculo atual
    // para que a edição não apague o @ já informado. Falha aqui é silenciosa.
    void (async () => {
      try {
        const link = await getOwnSocialProfile(targetEventId);
        if (link?.handle) setDraft((d) => ({ ...d, instagram: `@${link.handle}` }));
      } catch {
        /* enriquecimento opcional — nunca bloqueia a edição */
      }
    })();
  }
  function continueDraft() {
    setMode("edit");
    setShowConflict(false);
  }

  // ------------------------------------------------------------------
  // Catálogo — distinção clara entre "cache com refresh falho" e "modo manual"
  // ------------------------------------------------------------------
  const fallbackSegmentId = draft.segmentId?.trim() || "";
  const catalogAvailability = resolveCatalogAvailability({
    data: catalogQuery.data ?? null,
    isPending: catalogQuery.isPending,
    isError: catalogQuery.isError,
    fallbackSegmentId,
  });
  const effectiveCatalog: EventCatalog | null =
    catalogAvailability.kind === "ready" ? catalogAvailability.catalog : null;
  const manualCatalogMode = catalogAvailability.kind === "ready" && catalogAvailability.manualMode;
  const catalogRefreshFailed =
    catalogAvailability.kind === "ready" && catalogAvailability.refreshFailed;

  const runRecompute = useCallback(async () => {
    try {
      await recomputeOwnMatches(targetEventId);
      qc.invalidateQueries({ queryKey: qk.ownMatches(targetEventId) });
      dispatch({ type: "MATCH_OK" });
      clearWizardDraft();
      toast.success(mode === "edit" ? "Alterações salvas!" : "Perfil criado! Buscando conexões…");
      navigate({
        to: "/participante",
        search: { event: isSandbox ? targetEventId : "" },
      });
    } catch (err) {
      dispatch({ type: "MATCH_FAIL" });
      toast.error(errorToUserMessage(err, "Não conseguimos calcular seus matches agora."));
    }
  }, [mode, navigate, qc, targetEventId, isSandbox]);

  // ------------------------------------------------------------------
  // Submit — delega ao orchestrator puro (`runWizardSubmit`) e aplica os
  // eventos no reducer + toasts. Isso torna a garantia "sem RPC sem WhatsApp"
  // testável em unidade sem simular a rota inteira.
  // ------------------------------------------------------------------
  const startSubmit = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const withContactUpfront = mode === "create" ? true : !!phone.trim();
      dispatch({ type: "START", mode, withContact: withContactUpfront });
      // Rascunhos antigos podem ter itens de texto livre com label idêntico a
      // um item ativo do catálogo. Vinculamos ao id canônico (conservador,
      // só correspondência exata e única) antes de enviar — sem deduplicar.
      const events = await runWizardSubmit({
        draft: canonicalizeDraftItems(draft, effectiveCatalog?.taxonomy ?? null),
        mode,
        phone,
        eventId: targetEventId,
        socialContext: social.result?.status === "ok" ? social.result.context : null,
        deps: {
          saveOwnProfile,
          setOwnContact,
          linkSocialProfile: linkOwnSocialProfile,
        },
      });
      for (const evt of events) {
        if (evt.type === "PRE_FAIL") {
          dispatch({ type: "RESET" });
          toast.error(evt.message);
          if (evt.reason === "phone") goToIdentity();
          else if (evt.reason === "duplicate_offer") goToOffers();
          else if (evt.reason === "duplicate_need") goToNeeds();
          return;
        }
        if (evt.type === "PROFILE_OK") {
          qc.invalidateQueries({ queryKey: qk.ownProfile(targetEventId) });
          dispatch({ type: "PROFILE_OK" });
        } else if (evt.type === "PROFILE_FAIL") {
          dispatch({ type: "PROFILE_FAIL" });
          toast.error(errorToUserMessage(evt.error, "Não foi possível salvar seu perfil."));
          return;
        } else if (evt.type === "CONTACT_OK") {
          dispatch({ type: "CONTACT_OK" });
        } else if (evt.type === "CONTACT_FAIL") {
          dispatch({ type: "CONTACT_FAIL" });
          toast.error(errorToUserMessage(evt.error, "Perfil salvo, contato não."));
          return;
        } else if (evt.type === "MATCH_OK") {
          qc.invalidateQueries({ queryKey: qk.ownMatches(targetEventId) });
          dispatch({ type: "MATCH_OK" });
          clearWizardDraft();
          toast.success(
            mode === "edit" ? "Alterações salvas!" : "Perfil criado! Buscando conexões…",
          );
          navigate({
            to: "/participante",
            search: { event: isSandbox ? targetEventId : "" },
          });
        } else if (evt.type === "MATCH_FAIL") {
          dispatch({ type: "MATCH_FAIL" });
          toast.error(
            errorToUserMessage(evt.error, "Não conseguimos calcular seus matches agora."),
          );
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [
    draft,
    mode,
    phone,
    qc,
    navigate,
    goToIdentity,
    goToOffers,
    goToNeeds,
    social.result,
    targetEventId,
    isSandbox,
  ]);

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
      // Hardening 09/09/2026: antes, no modo "create", o retry parava aqui e a
      // máquina de estados ficava presa em `recomputing_matches` ("Buscando
      // conexões…"). O save do perfil já recomputa transacionalmente, então o
      // recompute aqui é recuperação explícita e determinística nos dois modos.
      if (shouldRecomputeAfterContactRetry(mode)) {
        await runRecompute();
      }
    } finally {
      runningRef.current = false;
    }
  }, [phone, mode, runRecompute]);

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

  const goToPanel = useCallback(() => {
    clearWizardDraft();
    navigate({
      to: "/participante",
      search: { event: isSandbox ? targetEventId : "" },
    });
  }, [navigate, isSandbox, targetEventId]);

  // ------------------------------------------------------------------
  // Guardas de renderização — precedência resolvida por helper puro.
  // ------------------------------------------------------------------
  const pageState = resolveWizardPageState({
    session:
      session.status === "error" ? "error" : session.status === "loading" ? "loading" : "ready",
    profile: profileQuery.isError ? "error" : profileQuery.isPending ? "pending" : "success",
    hydrated,
  });

  if (pageState === "session_error") {
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
  if (pageState === "session_loading") {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </section>
      </PageShell>
    );
  }
  if (pageState === "profile_error") {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Não foi possível carregar seu perfil</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Não conseguimos verificar se você já tem um perfil neste evento. Sem essa verificação,
              o wizard não pode continuar com segurança.
            </p>
            <Button
              className="mt-4"
              onClick={() => void profileQuery.refetch()}
              disabled={profileQuery.isFetching}
              aria-busy={profileQuery.isFetching}
            >
              {profileQuery.isFetching ? "Tentando…" : "Tentar novamente"}
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }
  if (pageState === "profile_loading" || pageState === "hydrating") {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </section>
      </PageShell>
    );
  }

  if (catalogQuery.isPending && !effectiveCatalog) {
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
  if (!effectiveCatalog) {
    // Novo participante sem segmento autoritativo — impossível continuar.
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Catálogo indisponível</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Não conseguimos carregar segmentos e taxonomia do evento. Para criar um perfil novo é
              necessário que o catálogo esteja disponível.
            </p>
            <Button
              className="mt-4"
              onClick={() => void catalogQuery.refetch()}
              disabled={catalogQuery.isFetching}
              aria-busy={catalogQuery.isFetching}
            >
              {catalogQuery.isFetching ? "Tentando…" : "Tentar novamente"}
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  const catalog = effectiveCatalog;
  const step = draft.step;
  const progress = ((step + 1) / STEPS.length) * 100;
  const validation = validateWizardForSubmit({ draft, mode, phone });

  const resetAction = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      data-testid="wizard-reset-trigger"
      onClick={() => setShowReset(true)}
      className="gap-2 font-medium text-foreground hover:border-destructive hover:text-destructive"
    >
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
      {WIZARD_RESET_COPY.trigger}
    </Button>
  );

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8">
        {isSandbox && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <TestTube2 className="h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-300">Ambiente de Testes (Sandbox)</p>
              <p className="text-xs text-white/70">
                Você está testando o cadastro de forma isolada. Seus dados e matches não aparecem para participantes da SudoExpo 2026.
              </p>
            </div>
          </div>
        )}

        {mode === "edit" && !showConflict && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            Você está editando seu perfil.
          </div>
        )}

        {manualCatalogMode && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="font-medium">Catálogo indisponível — modo manual</p>
            <p className="mt-1 text-muted-foreground">
              Segmento atual: <span className="font-medium">{fallbackSegmentId}</span>. Você pode
              continuar editando; novos itens serão salvos como "Outro".
            </p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void catalogQuery.refetch()}
                disabled={catalogQuery.isFetching}
                aria-busy={catalogQuery.isFetching}
              >
                {catalogQuery.isFetching ? "Tentando…" : "Tentar carregar catálogo novamente"}
              </Button>
            </div>
          </div>
        )}

        {catalogRefreshFailed && (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="font-medium">Não foi possível atualizar o catálogo.</p>
            <p className="mt-1 text-muted-foreground">
              Você está usando a última versão carregada.
            </p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void catalogQuery.refetch()}
                disabled={catalogQuery.isFetching}
                aria-busy={catalogQuery.isFetching}
              >
                {catalogQuery.isFetching ? "Tentando…" : "Tentar atualizar novamente"}
              </Button>
            </div>
          </div>
        )}

        {/* Ação secundária/perigosa: vive no rodapé de cada etapa. */}



        <div className="mb-6 flex h-8 items-start gap-2">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={back}
              aria-label="Voltar para a etapa anterior"
              data-testid="wizard-back"
              className="h-8 w-8 shrink-0"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <div className="h-8 min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Etapa {step + 1} de {STEPS.length}
              </span>
              <span className="truncate">{STEPS[step]}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>


        {step === 0 && (
          <StepIdentity
            draft={draft}
            update={update}
            onNext={next}
            mode={mode}
            phone={phone}
            onPhoneChange={setPhone}
            resetAction={resetAction}
          />
        )}
        {step === 1 && (
          <StepWhoIAm
            draft={draft}
            update={update}
            onNext={() => void continueFromWhoIAm()}
            onBack={back}
            catalog={catalog}
            manualMode={manualCatalogMode}
            manualSegmentLabel={fallbackSegmentId}
            social={social}
            resetAction={resetAction}
          />
        )}

        {step === 2 && (
          <StepOffers
            draft={draft}
            update={update}
            onNext={next}
            onBack={back}
            catalog={catalog}
            eventId={targetEventId}
            aiAnalysis={aiAnalysis}
            socialContext={social.result?.status === "ok" ? social.result.context : null}
            socialAnalysis={
              social.result?.status === "ok" ? (social.result.analysis ?? null) : null
            }
            resetAction={resetAction}
          />
        )}
        {step === 3 && (
          <StepWhoISeek
            draft={draft}
            update={update}
            onNext={next}
            onBack={back}
            catalog={catalog}
            eventId={targetEventId}
            aiAnalysis={aiAnalysis}
            socialContext={social.result?.status === "ok" ? social.result.context : null}
            socialAnalysis={
              social.result?.status === "ok" ? (social.result.analysis ?? null) : null
            }
            resetAction={resetAction}
          />
        )}
        {step === 4 && (
          <StepReview
            draft={draft}
            onBack={back}
            onSubmit={() => setShowPhoneConfirm(true)}
            onRetryContact={() => void retryContact()}
            onRetryMatch={() => void retryMatch()}
            onGoToPanel={goToPanel}
            onGoToIdentity={goToIdentity}
            submit={submit}
            resetAction={resetAction}
            mode={mode}
            catalog={catalog}
            validation={validation}
            catalogFallback={manualCatalogMode}
          />
        )}
      </section>

      <AlertDialog open={showReset} onOpenChange={setShowReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{WIZARD_RESET_COPY.title}</AlertDialogTitle>
            <AlertDialogDescription>{WIZARD_RESET_COPY.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-white">{WIZARD_RESET_COPY.cancel}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="wizard-reset-confirm"
              onClick={() => void confirmReset()}
            >
              {WIZARD_RESET_COPY.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPhoneConfirm} onOpenChange={setShowPhoneConfirm}>
        <AlertDialogContent data-testid="phone-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirme seu WhatsApp</AlertDialogTitle>
            <AlertDialogDescription>
              É por esse número que você realizará login nesta plataforma, também é por ele que as
              oportunidades vão te encontrar. Confira se está correto:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center font-display text-xl font-semibold text-white">
            {phone.trim() || "—"}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="text-white"
              onClick={() => {
                setShowPhoneConfirm(false);
                goToIdentity();
              }}
            >
              Corrigir número
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="phone-confirm-submit"
              onClick={() => {
                setShowPhoneConfirm(false);
                void startSubmit();
              }}
            >
              Está correto, finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Você já tem um perfil neste evento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos um rascunho salvo neste dispositivo. O que deseja fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-white" onClick={continueDraft}>
              Continuar rascunho
            </AlertDialogCancel>
            <AlertDialogAction onClick={loadServerProfile}>Carregar meu perfil</AlertDialogAction>
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
      case "invalid_offer_label":
        return "Revise o que você oferece: cada item precisa de 2 a 120 caracteres.";
      case "invalid_need_label":
        return "Revise o que você procura: cada item precisa de 2 a 120 caracteres.";
      case "invalid_offer_detail":
      case "invalid_need_detail":
        return "Algum detalhe passou do limite de 300 caracteres.";
      case "duplicate_offer_label":
        return "Há itens repetidos no que você oferece.";
      case "duplicate_need_label":
        return "Há itens repetidos no que você procura.";
      case "invalid_offer_taxonomy":
      case "invalid_need_taxonomy":
        return "Algum item selecionado não pertence ao segmento escolhido.";
      case "missing_fields":
        return "Preencha todos os campos obrigatórios.";
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
    if (err.code === "single_priority_required") return "Marque exatamente uma prioridade.";
    return "Revise os campos do formulário.";
  }
  return fallback;
}

// Wizard-side helper — kept exported for tests.
export { isSubmitting };
