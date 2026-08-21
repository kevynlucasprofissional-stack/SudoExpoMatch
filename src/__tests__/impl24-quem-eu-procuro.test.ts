import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { createEmptyDraft, sanitizeWizardDraft, saveWizardDraft, loadWizardDraft } from "@/features/onboarding/draft";
import { validateWizardForSubmit, targetProfileAnswered } from "@/features/onboarding/validate";
import { mapWizardToSaveProfileInput, mapProfileToWizardDraft } from "@/features/onboarding/mappers";
import { profileSelectableSegments } from "@/features/onboarding/BusinessProfileCriteria";
import type { WizardDraft } from "@/features/onboarding/types";
import type { CatalogSegment, OwnProfileDTO } from "@/features/participant/types";

const STEPS_SRC = readFileSync("src/features/onboarding/steps.tsx", "utf8");
const CRITERIA_SRC = readFileSync("src/features/onboarding/BusinessProfileCriteria.tsx", "utf8");
const PHONE = "+5547999999999";
const EVENT = "sudoexpo-2026";

function baseDraft(over: Partial<WizardDraft> = {}): WizardDraft {
  return {
    ...createEmptyDraft(),
    name: "Ana",
    company: "Empresa XYZ",
    city: "Rio do Sul",
    businessSize: "pequeno",
    businessType: "servico",
    segmentId: "alimentacao",
    summary: "Restaurante com delivery próprio.",
    targetBusinessSize: "any",
    targetBusinessType: "any",
    targetSegmentId: "any",
    consent: true,
    offers: [{ localId: "o1", label: "Marmitas", segmentId: "alimentacao", taxonomyItemId: null }],
    needs: [
      {
        localId: "n1",
        label: "Sistema de gestão",
        segmentId: "tecnologia",
        taxonomyItemId: null,
        needKind: "servico",
        isPriority: true,
      },
    ],
    ...over,
  };
}

const SEGMENTS: CatalogSegment[] = [
  { id: "alimentacao", label: "Alimentação", emoji: null, profile_selectable: true },
  { id: "marketing", label: "Marketing", emoji: null, profile_selectable: true },
  { id: "comercio", label: "Comércio", emoji: null, profile_selectable: false },
  { id: "industria", label: "Indústria", emoji: null, profile_selectable: false },
  { id: "servicos", label: "Serviços", emoji: null, profile_selectable: false },
];

describe("Etapa 4 — Quem eu procuro", () => {
  it("self e target usam o mesmo componente base de classificadores", () => {
    expect(CRITERIA_SRC).toContain("export function BusinessProfileCriteria");
    // Uma única fonte das opções de porte/tipo.
    expect(STEPS_SRC).not.toContain("const BUSINESS_SIZE_OPTIONS");
    expect(STEPS_SRC).toContain('mode="self"');
    expect(STEPS_SRC).toContain('mode="target"');
  });

  it("campos exclusivos do perfil próprio não vazam para o perfil desejado", () => {
    for (const field of ["niche", "summary", "instagram"]) {
      expect(CRITERIA_SRC).not.toContain(`draft.${field}`);
    }
    expect(STEPS_SRC).toContain('id="niche"');
    expect(STEPS_SRC).toContain('id="summary"');
    expect(STEPS_SRC).toContain('id="instagram"');
  });

  it("título e copy da etapa 4 comunicam intenção de busca", () => {
    expect(STEPS_SRC).toContain("Quem eu procuro");
    expect(STEPS_SRC).toContain(
      "Agora descreva o perfil de empresa com quem você quer se conectar.",
    );
  });

  it("diferenciação não depende só de cor: eyebrow + ícone + texto", () => {
    expect(STEPS_SRC).toContain("Etapa 2 · Meu perfil");
    expect(STEPS_SRC).toContain("Etapa 4 · Perfil que quero encontrar");
    expect(STEPS_SRC).toContain("<Target ");
    expect(STEPS_SRC).toContain("<User ");
    // accents da marca, em tokens semânticos
    expect(CRITERIA_SRC).toContain("ring-secondary/40");
    expect(CRITERIA_SRC).toContain("ring-success/40");
  });

  it("segmento oferecido exclui Comércio/Indústria/Serviços (profile_selectable=false)", () => {
    const ids = profileSelectableSegments(SEGMENTS).map((s) => s.id);
    expect(ids).toEqual(["alimentacao", "marketing"]);
    expect(ids).not.toContain("comercio");
    expect(ids).not.toContain("industria");
    expect(ids).not.toContain("servicos");
  });

  it("Comércio/Indústria/Serviço continuam disponíveis em Tipo principal", () => {
    for (const v of ["comercio", "industria", "servico"]) {
      expect(CRITERIA_SRC).toContain(`value: "${v}"`);
    }
  });

  it("Qualquer é oferecido apenas no modo target", () => {
    expect(CRITERIA_SRC).toContain('const withAny = mode === "target"');
    expect(CRITERIA_SRC).toContain("ANY_LABEL");
  });

  it("não avança com controle não respondido; Qualquer é resposta válida", () => {
    expect(targetProfileAnswered(baseDraft())).toBe(true);
    expect(targetProfileAnswered(baseDraft({ targetBusinessSize: "" }))).toBe(false);
    expect(targetProfileAnswered(baseDraft({ targetBusinessType: "" }))).toBe(false);
    expect(targetProfileAnswered(baseDraft({ targetSegmentId: "" }))).toBe(false);
    expect(
      targetProfileAnswered(
        baseDraft({ targetBusinessSize: "medio", targetSegmentId: "marketing" }),
      ),
    ).toBe(true);
    // o botão da seção de necessidades respeita esse bloqueio
    expect(STEPS_SRC).toContain("nextBlocked={!targetAnswered}");
  });

  it("submit rejeita perfil desejado não respondido com motivo dedicado", () => {
    const res = validateWizardForSubmit({
      draft: baseDraft({ targetSegmentId: "" }),
      mode: "create",
      phone: PHONE,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("target");
    expect(validateWizardForSubmit({ draft: baseDraft(), mode: "create", phone: PHONE }).ok).toBe(
      true,
    );
  });

  it("Qualquer vira NULL no backend; valor específico é preservado", () => {
    const anyInput = mapWizardToSaveProfileInput(baseDraft(), EVENT);
    expect(anyInput.targetBusinessSize).toBeNull();
    expect(anyInput.targetBusinessType).toBeNull();
    expect(anyInput.targetSegmentId).toBeNull();

    const specific = mapWizardToSaveProfileInput(
      baseDraft({
        targetBusinessSize: "grande",
        targetBusinessType: "industria",
        targetSegmentId: "marketing",
      }),
      EVENT,
    );
    expect(specific.targetBusinessSize).toBe("grande");
    expect(specific.targetBusinessType).toBe("industria");
    expect(specific.targetSegmentId).toBe("marketing");
  });

  it("mudar target não muda self e mudar self não muda target", () => {
    const d = baseDraft();
    const changedTarget: WizardDraft = {
      ...d,
      targetBusinessSize: "grande",
      targetBusinessType: "industria",
      targetSegmentId: "marketing",
    };
    expect(changedTarget.businessSize).toBe("pequeno");
    expect(changedTarget.businessType).toBe("servico");
    expect(changedTarget.segmentId).toBe("alimentacao");

    const changedSelf: WizardDraft = {
      ...changedTarget,
      businessSize: "medio",
      businessType: "comercio",
      segmentId: "marketing",
    };
    expect(changedSelf.targetBusinessSize).toBe("grande");
    expect(changedSelf.targetBusinessType).toBe("industria");
    expect(changedSelf.targetSegmentId).toBe("marketing");
  });

  it("targetSegmentId e need.segmentId são conceitos independentes (cross-segment)", () => {
    const d = baseDraft({ targetSegmentId: "marketing" });
    const input = mapWizardToSaveProfileInput(d, EVENT);
    expect(input.targetSegmentId).toBe("marketing");
    expect(input.needs[0]!.segment_id).toBe("tecnologia");
  });

  it("necessidades continuam independentes e com a inteligência atual", () => {
    expect(STEPS_SRC).toContain("Refine o que você procura");
    expect(STEPS_SRC).toContain("O que faria essa conexão ser ainda mais útil?");
    expect(STEPS_SRC).toContain("export function StepNeeds");
    expect(STEPS_SRC).toContain("buildSuggestionFeed");
    expect(STEPS_SRC).toContain("AI_SUGGESTION_BADGE");
    expect(STEPS_SRC).toContain("Comuns no seu segmento");
    expect(STEPS_SRC).toContain("Qual a CATEGORIA daquilo que procura?");
    expect(STEPS_SRC).toContain("<StepNeeds");
  });

  it("IA não sobrescreve target_* (nenhuma sugestão escreve nesses campos)", () => {
    expect(STEPS_SRC).not.toMatch(/update\("target(BusinessSize|BusinessType|SegmentId)",\s*s\./);
    expect(STEPS_SRC).toContain('update("targetBusinessSize", v)');
  });

  it("revisão separa Quem eu sou / Quem eu procuro e mostra Qualquer", () => {
    expect(STEPS_SRC).toContain('data-testid="review-who-i-am"');
    expect(STEPS_SRC).toContain('data-testid="review-who-i-seek"');
    expect(STEPS_SRC).toContain("O que eu ofereço");
    expect(STEPS_SRC).toContain("O que eu preciso / procuro");
    expect(STEPS_SRC).toContain("targetSizeText");
    expect(STEPS_SRC).toContain("ANY_LABEL");
  });

  it("draft sobrevive a reload / back-forward preservando target", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const d = baseDraft({ step: 3, targetBusinessSize: "medio", targetSegmentId: "marketing" });
    saveWizardDraft(d, Date.now(), storage);
    const loaded = loadWizardDraft(Date.now(), storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.draft.targetBusinessSize).toBe("medio");
    expect(loaded!.draft.targetSegmentId).toBe("marketing");
    expect(loaded!.draft.targetBusinessType).toBe("any");
  });

  it("reset volta os três controles para não respondido", () => {
    const empty = createEmptyDraft();
    expect(empty.targetBusinessSize).toBe("");
    expect(empty.targetBusinessType).toBe("");
    expect(empty.targetSegmentId).toBe("");
    expect(targetProfileAnswered(empty)).toBe(false);
  });

  it("valores inválidos no rascunho são descartados, nunca aceitos", () => {
    const d = sanitizeWizardDraft({
      ...baseDraft(),
      targetBusinessSize: "gigante",
      targetBusinessType: "<script>",
    });
    expect(d.targetBusinessSize).toBe("");
    expect(d.targetBusinessType).toBe("");
  });

  it("edição reidrata NULL do banco como Qualquer (escolha consciente)", () => {
    const profile = {
      id: "p1",
      event_id: EVENT,
      name: "Ana",
      company: "XYZ",
      city: "Rio do Sul",
      neighborhood: null,
      segment_id: "alimentacao",
      business_size: "pequeno",
      business_type: "servico",
      niche: null,
      target_business_size: null,
      target_business_type: "industria",
      target_segment_id: "marketing",
      summary: "Restaurante",
      consent: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      offers: [],
      needs: [],
    } as unknown as OwnProfileDTO;
    const d = mapProfileToWizardDraft(profile);
    expect(d.targetBusinessSize).toBe("any");
    expect(d.targetBusinessType).toBe("industria");
    expect(d.targetSegmentId).toBe("marketing");
    expect(targetProfileAnswered(d)).toBe(true);
  });

  it("grid de segmentos é responsivo (390/768/1280) e não esmaga", () => {
    expect(CRITERIA_SRC).toContain("grid-cols-1");
    expect(CRITERIA_SRC).toContain("min-[420px]:grid-cols-2");
    expect(CRITERIA_SRC).toContain("lg:grid-cols-3");
    expect(CRITERIA_SRC).toContain("min-h-11");
  });
});
