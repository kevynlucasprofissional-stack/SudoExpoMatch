import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

import type { WizardDraft, WizardNeed } from "@/features/onboarding/types";
import {
  validateWizardForSubmit,
  currentPriorityId,
  hasSelectedPriority,
} from "@/features/onboarding/validate";
import { heuristicSuggestionProvider } from "@/features/onboarding/suggestions";

function baseDraft(overrides?: Partial<WizardDraft>): WizardDraft {
  const d: WizardDraft = {
    step: 4,
    name: "Ana",
    company: "Acme",
    city: "Rio Verde",
    neighborhood: "",
    businessSize: "pequeno",
    businessType: "servico",
    niche: "",
    segmentId: "servicos",
    summary: "Oferecemos consultoria contábil para pequenas empresas locais",
    instagram: "",
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
  return { ...d, ...(overrides ?? {}) };
}

// ==================================================================
// validate.ts
// ==================================================================
describe("validateWizardForSubmit", () => {
  it("create: perfil ok + phone válido => ok", () => {
    const v = validateWizardForSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "(64) 99999-9999",
    });
    expect(v.ok).toBe(true);
  });

  it("create: perfil ok + phone vazio => phone reason (não passa)", () => {
    const v = validateWizardForSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("phone");
  });

  it("create: phone inválido curto => phone reason", () => {
    const v = validateWizardForSubmit({
      draft: baseDraft(),
      mode: "create",
      phone: "123",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("phone");
  });

  it("edit: phone vazio é permitido", () => {
    const v = validateWizardForSubmit({
      draft: baseDraft(),
      mode: "edit",
      phone: "",
    });
    expect(v.ok).toBe(true);
  });

  it("edit: phone inválido não é permitido", () => {
    const v = validateWizardForSubmit({
      draft: baseDraft(),
      mode: "edit",
      phone: "abc",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("phone");
  });

  it("perfil sem prioridade => reason priority", () => {
    const noPri = baseDraft({
      needs: [{ ...baseDraft().needs[0], isPriority: false }],
    });
    const v = validateWizardForSubmit({
      draft: noPri,
      mode: "create",
      phone: "(64) 99999-9999",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("priority");
  });
});

// ==================================================================
// StepPriority helper — sem seleção fantasma
// ==================================================================
describe("currentPriorityId / hasSelectedPriority", () => {
  it("retorna vazio quando nenhuma need marcada", () => {
    const d = baseDraft({
      needs: [{ ...baseDraft().needs[0], isPriority: false }],
    });
    expect(currentPriorityId(d)).toBe("");
    expect(hasSelectedPriority(d)).toBe(false);
  });
  it("não elege o primeiro item automaticamente", () => {
    const d = baseDraft({
      needs: [
        { ...baseDraft().needs[0], localId: "n1", isPriority: false },
        {
          localId: "n2",
          label: "outra",
          segmentId: "servicos",
          taxonomyItemId: null,
          needKind: "servico",
          isPriority: false,
        } satisfies WizardNeed,
      ],
    });
    expect(currentPriorityId(d)).toBe("");
  });
  it("retorna o localId da prioridade marcada", () => {
    const d = baseDraft();
    expect(currentPriorityId(d)).toBe("n1");
    expect(hasSelectedPriority(d)).toBe(true);
  });
});

// ==================================================================
// Sugestões: catálogo vazio => nenhum item (modo manual)
// ==================================================================
describe("suggestions: catálogo vazio (modo manual)", () => {
  it("não retorna nenhum item quando taxonomy=[]", async () => {
    const r = await heuristicSuggestionProvider.suggest({
      segmentId: "servicos",
      summary: "qualquer",
      catalog: { segments: [], taxonomy: [] },
    });
    expect(r.items).toEqual([]);
  });
});

// ==================================================================
// Guarda estática: catálogo mockado não voltou ao wizard
// ==================================================================
describe("busca estática (hardening B): sem catálogo mockado", () => {
  it("wizard não importa SEGMENTS/TAXONOMY de mock-data", () => {
    const out = execSync(
      'grep -rnE "SEGMENTS|TAXONOMY|NEED_KIND_LABELS" src/routes/participar.tsx src/features/onboarding || true',
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
  it("o wizard não importa a configuração global do evento (recebe via props/rota)", () => {
    const out = execSync(
      'grep -rnE "from [\'\\"]@/config/event[\'\\"]" src/features/onboarding || true',
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
});
