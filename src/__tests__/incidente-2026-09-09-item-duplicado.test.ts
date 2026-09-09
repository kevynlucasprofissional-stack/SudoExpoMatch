/**
 * Regressão do incidente de cadastro de 09/09/2026.
 *
 * O front comparava labels só por `toLowerCase()`; o banco compara por
 * `public.norm_label` (minúsculas + sem acentos + espaços colapsados).
 * Itens equivalentes chegavam ao save e voltavam como `duplicate_need_label`.
 */
import { describe, it, expect, vi } from "vitest";

import {
  itemIdentity,
  isEquivalentItem,
  hasEquivalentItem,
  findDuplicatePair,
  normalizeLabel,
} from "@/features/onboarding/itemIdentity";
import { mergeCapped } from "@/features/onboarding/mergeItems";
import { validateWizardForSubmit } from "@/features/onboarding/validate";
import { mapWizardToSaveProfileInput, WizardMappingError } from "@/features/onboarding/mappers";
import { preSubmit, runWizardSubmit } from "@/features/onboarding/submitOrchestrator";
import type { WizardDraft, WizardNeed, WizardOffer } from "@/features/onboarding/types";

const TAX_A = "11111111-1111-1111-1111-111111111111";
const TAX_B = "22222222-2222-2222-2222-222222222222";

function offer(over: Partial<WizardOffer> = {}): WizardOffer {
  return {
    localId: crypto.randomUUID(),
    label: "Consultoria agrícola",
    segmentId: "agro",
    taxonomyItemId: null,
    ...over,
  };
}

function need(over: Partial<WizardNeed> = {}): WizardNeed {
  return {
    ...offer(),
    needKind: "servico",
    isPriority: false,
    ...over,
  } as WizardNeed;
}

function draftWith(over: Partial<WizardDraft> = {}): WizardDraft {
  return {
    step: 4,
    name: "Ana",
    company: "Acme",
    city: "Rio Verde",
    neighborhood: "",
    businessSize: "pequeno",
    businessType: "servico",
    niche: "",
    segmentId: "agro",
    summary: "Consultoria para produtores rurais da região",
    instagram: "",
    targetBusinessSize: "any",
    targetBusinessType: "any",
    targetSegmentId: "any",
    offers: [offer({ label: "Consultoria agrícola" })],
    needs: [need({ label: "Insumos agrícolas", isPriority: true })],
    consent: true,
    ...over,
  };
}

// ==================================================================
// Identidade canônica
// ==================================================================
describe("itemIdentity — mesma regra do banco (norm_label)", () => {
  it("normaliza acento, case, espaços duplos e tabs", () => {
    expect(normalizeLabel("  Insumos\tagrícolas  ")).toBe("insumos agricolas");
    expect(normalizeLabel("Insumos  AGRICOLAS")).toBe("insumos agricolas");
  });

  it("acento: agrícolas == agricolas", () => {
    expect(
      isEquivalentItem({ label: "Insumos agrícolas" }, { label: "Insumos agricolas" }),
    ).toBe(true);
  });

  it("espaços duplos e tabs colidem", () => {
    expect(isEquivalentItem({ label: "Insumos  agrícolas" }, { label: "Insumos agrícolas" })).toBe(
      true,
    );
    expect(isEquivalentItem({ label: "Insumos\tagrícolas" }, { label: "Insumos agrícolas" })).toBe(
      true,
    );
  });

  it("case difere só em maiúsculas => equivalente", () => {
    expect(isEquivalentItem({ label: "CRÉDITO" }, { label: "crédito" })).toBe(true);
  });

  it("mesmo taxonomyItemId com labels diferentes => equivalente", () => {
    expect(
      isEquivalentItem(
        { label: "Crédito empresarial", taxonomyItemId: TAX_A },
        { label: "Financiamento PJ", taxonomyItemId: TAX_A },
      ),
    ).toBe(true);
  });

  it("catálogo (com id) + texto livre (sem id) com mesmo label => equivalente", () => {
    expect(
      isEquivalentItem(
        { label: "Gestão empresarial", taxonomyItemId: TAX_A },
        { label: "gestao empresarial", taxonomyItemId: null },
      ),
    ).toBe(true);
  });

  it("itens realmente distintos continuam permitidos", () => {
    expect(
      isEquivalentItem(
        { label: "Insumos agrícolas", taxonomyItemId: TAX_A },
        { label: "Máquinas agrícolas", taxonomyItemId: TAX_B },
      ),
    ).toBe(false);
    expect(hasEquivalentItem([{ label: "Contabilidade" }], { label: "Marketing" })).toBe(false);
  });

  it("identidade usa o id quando existe, senão o label normalizado", () => {
    expect(itemIdentity({ label: "X", taxonomyItemId: TAX_A })).toBe(`id:${TAX_A}`);
    expect(itemIdentity({ label: " Ágil  Já " })).toBe("label:agil ja");
  });

  it("findDuplicatePair devolve os dois labels originais", () => {
    const pair = findDuplicatePair([
      { label: "Insumos agrícolas" },
      { label: "Máquinas" },
      { label: "insumos  agricolas" },
    ]);
    expect(pair?.first.label).toBe("Insumos agrícolas");
    expect(pair?.second.label).toBe("insumos  agricolas");
  });
});

// ==================================================================
// mergeCapped ("Aceitar todas")
// ==================================================================
describe("mergeCapped — não aceita equivalentes", () => {
  it("ignora variação de acento/espaço vinda das sugestões", () => {
    const out = mergeCapped(
      [{ label: "Insumos agrícolas", taxonomyItemId: null }],
      [
        { label: "insumos  agricolas", taxonomyItemId: null },
        { label: "Máquinas agrícolas", taxonomyItemId: TAX_B },
      ],
      5,
    );
    expect(out.map((x) => x.label)).toEqual(["Insumos agrícolas", "Máquinas agrícolas"]);
  });

  it("ignora sugestão com o mesmo taxonomyItemId e label diferente", () => {
    const out = mergeCapped(
      [{ label: "Crédito empresarial", taxonomyItemId: TAX_A }],
      [{ label: "Financiamento PJ", taxonomyItemId: TAX_A }],
      5,
    );
    expect(out).toHaveLength(1);
  });
});

// ==================================================================
// validateWizardForSubmit — detecta antes de qualquer RPC
// ==================================================================
describe("validateWizardForSubmit — colisão de itens", () => {
  it("necessidades: acento diferente => reason duplicate_need com os dois labels", () => {
    const v = validateWizardForSubmit({
      draft: draftWith({
        needs: [
          need({ label: "Insumos agrícolas", isPriority: true }),
          need({ label: "insumos agricolas" }),
        ],
      }),
      mode: "create",
      phone: "(64) 99999-9999",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("duplicate_need");
      expect(v.message).toContain("o que você procura");
      expect(v.message).toContain("Insumos agrícolas");
      expect(v.message).toContain("insumos agricolas");
    }
  });

  it("ofertas: espaço duplo => reason duplicate_offer", () => {
    const v = validateWizardForSubmit({
      draft: draftWith({
        offers: [offer({ label: "Consultoria agrícola" }), offer({ label: "Consultoria  agrícola" })],
      }),
      mode: "create",
      phone: "(64) 99999-9999",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("duplicate_offer");
      expect(v.message).toContain("o que você oferece");
    }
  });

  it("rascunho antigo inválido é detectado, não deduplicado em silêncio", () => {
    const stale = draftWith({
      needs: [
        need({ label: "Gestão empresarial", taxonomyItemId: TAX_A, isPriority: true }),
        need({ label: "gestao empresarial", taxonomyItemId: null }),
      ],
    });
    const v = validateWizardForSubmit({ draft: stale, mode: "edit", phone: "" });
    expect(v.ok).toBe(false);
    // rascunho preservado como estava
    expect(stale.needs).toHaveLength(2);
  });

  it("perfil sem colisão continua válido", () => {
    const v = validateWizardForSubmit({
      draft: draftWith(),
      mode: "create",
      phone: "(64) 99999-9999",
    });
    expect(v.ok).toBe(true);
  });
});

// ==================================================================
// preSubmit / orchestrator — nenhuma RPC quando inválido
// ==================================================================
describe("preSubmit e runWizardSubmit", () => {
  it("preSubmit falha e o orquestrador não chama nenhuma RPC", async () => {
    const draft = draftWith({
      needs: [
        need({ label: "Insumos agrícolas", isPriority: true }),
        need({ label: "Insumos  agricolas" }),
      ],
    });
    const pre = preSubmit({ draft, mode: "create", phone: "(64) 99999-9999" });
    expect(pre.ok).toBe(false);

    const saveOwnProfile = vi.fn();
    const setOwnContact = vi.fn();
    const linkSocialProfile = vi.fn();
    const events = await runWizardSubmit({
      draft,
      mode: "create",
      phone: "(64) 99999-9999",
      eventId: "sudoexpo-2026",
      deps: { saveOwnProfile, setOwnContact, linkSocialProfile },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "PRE_FAIL", reason: "duplicate_need" });
    expect(saveOwnProfile).not.toHaveBeenCalled();
    expect(setOwnContact).not.toHaveBeenCalled();
    expect(linkSocialProfile).not.toHaveBeenCalled();
  });
});

// ==================================================================
// mapper — última defesa de fronteira
// ==================================================================
describe("mapWizardToSaveProfileInput — última defesa", () => {
  it("bloqueia necessidades equivalentes", () => {
    const draft = draftWith({
      needs: [
        need({ label: "Insumos agrícolas", isPriority: true }),
        need({ label: "insumos  AGRICOLAS" }),
      ],
    });
    expect(() => mapWizardToSaveProfileInput(draft, "sudoexpo-2026")).toThrowError(
      WizardMappingError,
    );
    try {
      mapWizardToSaveProfileInput(draft, "sudoexpo-2026");
    } catch (e) {
      expect((e as WizardMappingError).code).toBe("duplicate_need_label");
    }
  });

  it("bloqueia ofertas com o mesmo taxonomyItemId", () => {
    const draft = draftWith({
      offers: [
        offer({ label: "Crédito empresarial", taxonomyItemId: TAX_A }),
        offer({ label: "Financiamento PJ", taxonomyItemId: TAX_A }),
      ],
    });
    try {
      mapWizardToSaveProfileInput(draft, "sudoexpo-2026");
      throw new Error("deveria ter falhado");
    } catch (e) {
      expect((e as WizardMappingError).code).toBe("duplicate_offer_label");
    }
  });

  it("payload sem colisão passa normalmente", () => {
    const input = mapWizardToSaveProfileInput(draftWith(), "sudoexpo-2026");
    expect(input.offers).toHaveLength(1);
    expect(input.needs).toHaveLength(1);
  });
});
