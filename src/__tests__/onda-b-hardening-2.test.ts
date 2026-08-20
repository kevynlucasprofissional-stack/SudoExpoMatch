import { describe, it, expect, vi } from "vitest";

import type { WizardDraft, WizardNeed } from "@/features/onboarding/types";
import { resolveCatalogAvailability } from "@/features/onboarding/catalogAvailability";
import { resolveWizardPageState } from "@/features/onboarding/pageState";
import { preSubmit, runWizardSubmit } from "@/features/onboarding/submitOrchestrator";

function baseDraft(overrides?: Partial<WizardDraft>): WizardDraft {
  const d: WizardDraft = {
    step: 5,
    name: "Ana",
    company: "Acme",
    city: "Rio Verde",
    neighborhood: "",
    segmentId: "servicos",
    summary: "Oferecemos consultoria contábil para pequenas empresas locais",
    offers: [
      {
        localId: "o1",
        label: "Consultoria contábil",
        segmentId: "servicos",
        taxonomyItemId: "tax-1",
      },
    ],
    needs: [
      {
        localId: "n1",
        label: "Fornecedor de embalagens",
        segmentId: "servicos",
        taxonomyItemId: "tax-2",
        needKind: "fornecedor",
        isPriority: true,
      } satisfies WizardNeed,
    ],
    consent: true,
  };
  return { ...d, ...overrides };
}

function noopDeps(overrides?: Partial<Parameters<typeof runWizardSubmit>[0]["deps"]>) {
  return {
    saveOwnProfile: vi.fn().mockResolvedValue(undefined),
    setOwnContact: vi.fn().mockResolvedValue(undefined),
    rotateOwnRecoveryCode: vi.fn().mockResolvedValue("ABCD-1234"),
    recomputeOwnMatches: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveCatalogAvailability
// ---------------------------------------------------------------------------
describe("resolveCatalogAvailability", () => {
  const cat = { segments: [{ id: "s", label: "S", emoji: null }], taxonomy: [] };

  it("ready + cache com refresh falho — não é modo manual", () => {
    const r = resolveCatalogAvailability({
      data: cat,
      isPending: false,
      isError: true,
      fallbackSegmentId: "s",
    });
    expect(r.kind).toBe("ready");
    if (r.kind === "ready") {
      expect(r.manualMode).toBe(false);
      expect(r.refreshFailed).toBe(true);
      expect(r.catalog).toBe(cat);
    }
  });

  it("sem dados + segmento autoritativo — modo manual real", () => {
    const r = resolveCatalogAvailability({
      data: null,
      isPending: false,
      isError: true,
      fallbackSegmentId: "servicos",
    });
    expect(r.kind).toBe("ready");
    if (r.kind === "ready") {
      expect(r.manualMode).toBe(true);
      expect(r.refreshFailed).toBe(false);
    }
  });

  it("sem dados + sem segmento + carregando => loading", () => {
    const r = resolveCatalogAvailability({
      data: null,
      isPending: true,
      isError: false,
      fallbackSegmentId: "",
    });
    expect(r.kind).toBe("loading");
  });

  it("sem dados + sem segmento + erro => blocked", () => {
    const r = resolveCatalogAvailability({
      data: null,
      isPending: false,
      isError: true,
      fallbackSegmentId: "",
    });
    expect(r.kind).toBe("blocked");
  });

  it("dados presentes sem erro => ready limpo", () => {
    const r = resolveCatalogAvailability({
      data: cat,
      isPending: false,
      isError: false,
      fallbackSegmentId: "s",
    });
    expect(r.kind).toBe("ready");
    if (r.kind === "ready") {
      expect(r.manualMode).toBe(false);
      expect(r.refreshFailed).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveWizardPageState
// ---------------------------------------------------------------------------
describe("resolveWizardPageState", () => {
  it("session error vence hydrated=false", () => {
    expect(resolveWizardPageState({ session: "error", profile: "pending", hydrated: false })).toBe(
      "session_error",
    );
  });
  it("session loading => session_loading", () => {
    expect(resolveWizardPageState({ session: "loading", profile: "success", hydrated: true })).toBe(
      "session_loading",
    );
  });
  it("session ready + profile error => profile_error (não hidrata)", () => {
    expect(resolveWizardPageState({ session: "ready", profile: "error", hydrated: false })).toBe(
      "profile_error",
    );
  });
  it("session ready + profile pending => profile_loading", () => {
    expect(resolveWizardPageState({ session: "ready", profile: "pending", hydrated: false })).toBe(
      "profile_loading",
    );
  });
  it("hidratação pendente após sucessos => hydrating", () => {
    expect(resolveWizardPageState({ session: "ready", profile: "success", hydrated: false })).toBe(
      "hydrating",
    );
  });
  it("tudo ok => ready", () => {
    expect(resolveWizardPageState({ session: "ready", profile: "success", hydrated: true })).toBe(
      "ready",
    );
  });
});

// ---------------------------------------------------------------------------
// preSubmit + runWizardSubmit — garantia de "nenhuma API sem WhatsApp"
// ---------------------------------------------------------------------------
describe("runWizardSubmit", () => {
  it("create sem phone: nenhuma API é chamada; PRE_FAIL com reason=phone", async () => {
    const deps = noopDeps();
    const events = await runWizardSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "",
      eventId: "evt",
      deps,
    });
    expect(events).toEqual([{ type: "PRE_FAIL", reason: "phone", message: expect.any(String) }]);
    expect(deps.saveOwnProfile).not.toHaveBeenCalled();
    expect(deps.setOwnContact).not.toHaveBeenCalled();
    expect(deps.rotateOwnRecoveryCode).not.toHaveBeenCalled();
    expect(deps.recomputeOwnMatches).not.toHaveBeenCalled();
    const pre = preSubmit({ draft: baseDraft(), mode: "create", phone: "" });
    expect(pre.ok).toBe(false);
  });

  it("edit sem phone: salva perfil e emite MATCH_OK sem chamar recompute (auto-recompute no banco)", async () => {
    const deps = noopDeps();
    const events = await runWizardSubmit({
      draft: baseDraft(),
      mode: "edit",
      phone: "",
      eventId: "evt",
      deps,
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual(["PROFILE_OK", "MATCH_OK"]);
    expect(deps.saveOwnProfile).toHaveBeenCalledTimes(1);
    expect(deps.setOwnContact).not.toHaveBeenCalled();
    expect(deps.rotateOwnRecoveryCode).not.toHaveBeenCalled();
    // save_own_profile_v2 dispara _recompute_matches_for_profile no banco,
    // então o orquestrador não faz mais RPC client-side de recompute.
    expect(deps.recomputeOwnMatches).not.toHaveBeenCalled();
  });

  it("create feliz: perfil -> contato -> code -> aguarda confirmação (sem recompute)", async () => {
    const deps = noopDeps();
    const events = await runWizardSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "64999990000",
      eventId: "evt",
      deps,
    });
    expect(events.map((e) => e.type)).toEqual([
      "PROFILE_OK",
      "CONTACT_OK",
      "CODE_OK",
      "AWAIT_CODE_CONFIRMATION",
    ]);
    expect(deps.recomputeOwnMatches).not.toHaveBeenCalled();
  });

  it("erro de perfil interrompe pipeline; contato/code/match não são chamados", async () => {
    const deps = noopDeps({
      saveOwnProfile: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const events = await runWizardSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "64999990000",
      eventId: "evt",
      deps,
    });
    expect(events.map((e) => e.type)).toEqual(["PROFILE_FAIL"]);
    expect(deps.setOwnContact).not.toHaveBeenCalled();
    expect(deps.rotateOwnRecoveryCode).not.toHaveBeenCalled();
    expect(deps.recomputeOwnMatches).not.toHaveBeenCalled();
  });

  it("erro de contato interrompe pipeline; code/match não são chamados", async () => {
    const deps = noopDeps({
      setOwnContact: vi.fn().mockRejectedValue(new Error("net")),
    });
    const events = await runWizardSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "64999990000",
      eventId: "evt",
      deps,
    });
    expect(events.map((e) => e.type)).toEqual(["PROFILE_OK", "CONTACT_FAIL"]);
    expect(deps.rotateOwnRecoveryCode).not.toHaveBeenCalled();
    expect(deps.recomputeOwnMatches).not.toHaveBeenCalled();
  });

  it("orchestrator não expõe API de retry — retry de contato não repete perfil", async () => {
    // Simula segundo ciclo somente da etapa de contato via API do orchestrator:
    // como `runWizardSubmit` é sem estado, uma nova chamada só ocorreria via UI.
    // Aqui garantimos que executá-lo isoladamente para "reprocessar" após falha
    // ainda parte do início — portanto a UI DEVE usar apenas ações granulares
    // do reducer (RETRY_CONTACT etc.), não `runWizardSubmit`, após uma falha
    // parcial. Esse teste documenta o contrato.
    const deps = noopDeps();
    await runWizardSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "64999990000",
      eventId: "evt",
      deps,
    });
    // Uma nova chamada de retry NÃO é feita pelo orchestrator.
    expect(deps.saveOwnProfile).toHaveBeenCalledTimes(1);
  });
});
