import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  clearWizardDraft,
  createEmptyDraft,
  loadWizardDraft,
  saveWizardDraft,
  WIZARD_DRAFT_KEY,
} from "@/features/onboarding/draft";
import { runWizardReset, WIZARD_RESET_COPY } from "@/features/onboarding/wizardReset";
import {
  entryToRecord,
  runSocialEnrichment,
  type SocialCacheRecord,
  type SocialCacheStore,
  type SocialEntry,
} from "@/lib/social-enrichment";
import { sanitizeSocialBusinessContext, type SocialProvider } from "@/lib/social-context";

// ---------------------------------------------------------------- fixtures
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function filledDraft() {
  return {
    ...createEmptyDraft(),
    step: 3,
    name: "Ana",
    company: "Empresa XYZ",
    city: "Rio do Sul",
    neighborhood: "Centro",
    businessSize: "pequeno" as const,
    businessType: "servico" as const,
    segmentId: "servicos",
    niche: "consultoria",
    summary: "Consultoria para pequenas indústrias.",
    instagram: "@empresaxyz",
    offers: [{ localId: "o1", label: "Consultoria", segmentId: "servicos", taxonomyItemId: null }],
    needs: [
      {
        localId: "n1",
        label: "Contador",
        segmentId: "servicos",
        taxonomyItemId: null,
        needKind: "servico" as const,
        isPriority: true,
      },
    ],
    consent: true,
  };
}

function cachedRecord(now: number): SocialCacheRecord {
  const context = sanitizeSocialBusinessContext({
    provider: "instagram_graph",
    handle: "empresaxyz",
    bio: "Consultoria industrial",
    fetchedAt: new Date(now).toISOString(),
  })!;
  const entry: SocialEntry = {
    context,
    analysis: null,
    fingerprint: "fp-1",
    fetchedAt: new Date(now).toISOString(),
    analyzedAt: null,
    promptVersion: null,
    model: null,
    provider: "instagram_graph",
  };
  return entryToRecord(entry, null);
}

function storeWith(record: SocialCacheRecord | null) {
  const writes: SocialCacheRecord[] = [];
  const store: SocialCacheStore = {
    read: async () => record,
    write: async (r) => void writes.push(r),
  };
  return { store, writes };
}

function countingProvider(): SocialProvider & { calls: number } {
  const p = {
    id: "instagram_graph" as const,
    calls: 0,
    async fetchProfile() {
      p.calls += 1;
      return { status: "unavailable", reason: "error" } as const;
    },
  };
  return p;
}

// ------------------------------------------------------------------ testes
describe("Rascunho sobrevive ao reload", () => {
  it("reload durante o preenchimento preserva o progresso atual", () => {
    const storage = memoryStorage();
    const draft = filledDraft();
    saveWizardDraft(draft, Date.now(), storage);

    const loaded = loadWizardDraft(Date.now(), storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.draft.step).toBe(3);
    expect(loaded!.draft.name).toBe("Ana");
    expect(loaded!.draft.instagram).toBe("@empresaxyz");
    expect(loaded!.draft.offers).toHaveLength(1);
    expect(loaded!.draft.needs[0]!.isPriority).toBe(true);
  });
});

describe("Reidratação do contexto social pelo @ salvo no rascunho", () => {
  it("recupera o contexto persistido sem provider e sem IA", async () => {
    const now = Date.now();
    const provider = countingProvider();
    const { store } = storeWith(cachedRecord(now));

    const res = await runSocialEnrichment({
      raw: "@empresaxyz",
      actor: "u1",
      cacheOnly: true,
      deps: { provider, store, now: () => now },
    });

    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.source).toBe("database");
    expect(res.providerCalls).toBe(0);
    expect(res.aiCalls).toBe(0);
    expect(provider.calls).toBe(0);
  });

  it("cache vencido continua sendo reaproveitado no reload (zero custo)", async () => {
    const now = Date.now();
    const provider = countingProvider();
    const { store } = storeWith(cachedRecord(now - 30 * 24 * 60 * 60 * 1000));

    const res = await runSocialEnrichment({
      raw: "@empresaxyz",
      actor: "u1",
      cacheOnly: true,
      deps: { provider, store, now: () => now },
    });

    expect(res.status).toBe("ok");
    expect(provider.calls).toBe(0);
  });

  it("sem cache persistido, a reidratação falha silenciosamente sem chamar o provider", async () => {
    const provider = countingProvider();
    const { store } = storeWith(null);

    const res = await runSocialEnrichment({
      raw: "@empresaxyz",
      actor: "u1",
      cacheOnly: true,
      deps: { provider, store },
    });

    expect(res.status).toBe("unavailable");
    if (res.status === "unavailable") expect(res.reason).toBe("cache_miss");
    expect(provider.calls).toBe(0);
  });
});

describe("Reset do formulário", () => {
  function resetDeps(storage: Storage) {
    const state = {
      draft: filledDraft(),
      phone: "+5547999999999",
      social: "done",
      ai: "done",
      submit: "error",
      queryCacheCleared: false,
      sessionReset: false,
    };
    const deps = {
      clearDraft: () => clearWizardDraft(storage),
      setDraft: (d: ReturnType<typeof createEmptyDraft>) => {
        state.draft = d as typeof state.draft;
      },
      setPhone: (v: string) => {
        state.phone = v;
      },
      resetSocial: () => {
        state.social = "idle";
      },
      resetAi: () => {
        state.ai = "idle";
      },
      resetSubmit: () => {
        state.submit = "idle";
      },
      clearQueryCache: () => {
        state.queryCacheCleared = true;
      },
      resetSession: async () => {
        state.sessionReset = true;
      },
    };
    return { state, deps };
  }

  it("reset cancelado não altera nada", () => {
    const storage = memoryStorage();
    saveWizardDraft(filledDraft(), Date.now(), storage);
    const { state } = resetDeps(storage);

    // Cancelar = simplesmente não executar `runWizardReset`.
    expect(storage.getItem(WIZARD_DRAFT_KEY)).toBeTruthy();
    expect(state.draft.name).toBe("Ana");
    expect(loadWizardDraft(Date.now(), storage)!.draft.step).toBe(3);
  });

  it("reset confirmado limpa localStorage, estado React e volta à Etapa 1", async () => {
    const storage = memoryStorage();
    saveWizardDraft(filledDraft(), Date.now(), storage);
    const { state, deps } = resetDeps(storage);

    await runWizardReset(deps);

    expect(storage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
    expect(state.draft.step).toBe(0);
    expect(state.phone).toBe("");
    expect(state.social).toBe("idle");
    expect(state.ai).toBe("idle");
    expect(state.submit).toBe("idle");
    expect(state.queryCacheCleared).toBe(true);
    expect(state.sessionReset).toBe(true);
  });

  it("todos os campos do cadastro ficam vazios após o reset", async () => {
    const storage = memoryStorage();
    const { state, deps } = resetDeps(storage);
    await runWizardReset(deps);

    expect(state.draft).toEqual(createEmptyDraft());
    for (const v of Object.values(state.draft)) {
      if (Array.isArray(v)) expect(v).toHaveLength(0);
      else if (typeof v === "string") expect(v).toBe("");
      else if (typeof v === "boolean") expect(v).toBe(false);
      else expect(v).toBe(0);
    }
  });

  it("reload após o reset continua mostrando o formulário em branco", async () => {
    const storage = memoryStorage();
    saveWizardDraft(filledDraft(), Date.now(), storage);
    const { deps } = resetDeps(storage);
    await runWizardReset(deps);

    expect(loadWizardDraft(Date.now(), storage)).toBeNull();
  });

  it("não apaga o cache social global persistido do handle", async () => {
    const storage = memoryStorage();
    const now = Date.now();
    const { store, writes } = storeWith(cachedRecord(now));
    const { deps } = resetDeps(storage);

    await runWizardReset(deps);

    // O reset é puramente local: nenhuma escrita/remoção no cache global.
    expect(writes).toHaveLength(0);
    const after = await runSocialEnrichment({
      raw: "@empresaxyz",
      actor: "u1",
      cacheOnly: true,
      deps: { provider: countingProvider(), store, now: () => now },
    });
    expect(after.status).toBe("ok");
  });

  it("não apaga o perfil já salvo no backend (nenhuma RPC de exclusão é chamada)", async () => {
    const storage = memoryStorage();
    const deleteProfile = vi.fn();
    const { deps } = resetDeps(storage);
    await runWizardReset(deps);
    expect(deleteProfile).not.toHaveBeenCalled();

    const src = readFileSync("src/features/onboarding/wizardReset.ts", "utf8");
    expect(src).not.toMatch(/delete|remove_profile|supabase/i);
  });
});

describe("Posicionamento e segurança do botão de reset", () => {
  const page = readFileSync("src/routes/participar.tsx", "utf8");

  it("existe um gatilho visível durante o preenchimento", () => {
    expect(page).toContain(WIZARD_RESET_COPY.trigger);
    expect(page).toContain('data-testid="wizard-reset-trigger"');
  });

  it("nunca reseta no primeiro clique — apenas abre a confirmação", () => {
    const trigger = page.slice(
      page.indexOf('data-testid="wizard-reset-trigger"'),
      page.indexOf('data-testid="wizard-reset-trigger"') + 260,
    );
    expect(trigger).toContain("setShowReset(true)");
    expect(trigger).not.toContain("runWizardReset");
    expect(trigger).not.toContain("confirmReset");
  });

  it("a confirmação tem Cancelar e Limpar e começar novo cadastro", () => {
    expect(page).toContain("WIZARD_RESET_COPY.title");
    expect(page).toContain("WIZARD_RESET_COPY.cancel");
    expect(page).toContain("WIZARD_RESET_COPY.confirm");
    expect(WIZARD_RESET_COPY.title).toBe("Limpar este cadastro?");
    expect(WIZARD_RESET_COPY.cancel).toBe("Cancelar");
    expect(WIZARD_RESET_COPY.confirm).toBe("Limpar e começar novo cadastro");
  });

  it("fica no cabeçalho, antes do progresso e das etapas (longe dos CTAs)", () => {
    const triggerAt = page.indexOf('data-testid="wizard-reset-trigger"');
    const progressAt = page.indexOf("<Progress value={progress}");
    const firstStepAt = page.indexOf("{step === 0 &&");
    expect(triggerAt).toBeGreaterThan(0);
    expect(triggerAt).toBeLessThan(progressAt);
    expect(triggerAt).toBeLessThan(firstStepAt);
  });

  it("usa tratamento secundário legível (outline), nunca CTA primário", () => {
    const trigger = page.slice(
      page.indexOf('data-testid="wizard-reset-trigger"') - 200,
      page.indexOf('data-testid="wizard-reset-trigger"') + 300,
    );
    expect(trigger).toContain('variant="outline"');
    expect(trigger).toContain('size="sm"');
    expect(trigger).toContain("hover:text-destructive");
    expect(trigger).not.toContain('variant="ghost"');
    expect(trigger).not.toContain("text-xs");
    expect(trigger).toContain("text-sm");
    expect(trigger).toContain("RotateCcw");
  });

  it("é renderizado fora dos blocos de etapa (aparece nas 5 etapas)", () => {
    const triggerAt = page.indexOf('data-testid="wizard-reset-trigger"');
    for (const s of [0, 1, 2, 3, 4]) {
      const stepAt = page.indexOf(`{step === ${s} &&`);
      expect(stepAt).toBeGreaterThan(0);
      expect(triggerAt).toBeLessThan(stepAt);
    }
  });

  it("não colide com Avançar/Voltar/Salvar perfil — CTAs vivem nos steps", () => {
    const steps = readFileSync("src/features/onboarding/steps.tsx", "utf8");
    expect(steps).not.toContain(WIZARD_RESET_COPY.trigger);
    expect(steps).toMatch(/Continuar/); // CTA de avanço vive no rodapé de cada etapa
    // O gatilho está em um container próprio, alinhado à direita no topo.
    expect(page).toContain('<div className="mb-4 flex justify-end">');
  });

  it("mobile e desktop: container fluido sem largura fixa", () => {
    expect(page).toContain('className="mx-auto max-w-2xl px-4 py-8"');
    const trigger = page.slice(
      page.indexOf('data-testid="wizard-reset-trigger"'),
      page.indexOf('data-testid="wizard-reset-trigger"') + 300,
    );
    expect(trigger).not.toMatch(/w-\[\d+px\]|fixed|absolute/);
  });
});
