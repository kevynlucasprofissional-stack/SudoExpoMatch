import { describe, it, expect, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  createEmptyDraft,
  sanitizeWizardDraft,
  saveWizardDraft,
  loadWizardDraft,
  clearWizardDraft,
  hasValidWizardDraft,
  purgeLegacyDraft,
  draftAllowedKeys,
  WIZARD_DRAFT_KEY,
  LEGACY_DRAFT_KEY,
  DRAFT_MAX_AGE_MS,
} from "@/features/onboarding/draft";
import {
  mapProfileToWizardDraft,
  mapWizardToSaveProfileInput,
  normalizePhoneE164,
  WizardMappingError,
} from "@/features/onboarding/mappers";
import {
  initialSubmitState,
  submitReducer,
  isSubmitting,
  isCompleted,
  reviewIsActionable,
} from "@/features/onboarding/submitMachine";
import type { WizardDraft, WizardNeed } from "@/features/onboarding/types";
import type { OwnProfileDTO } from "@/features/participant/types";
import { heuristicSuggestionProvider } from "@/features/onboarding/suggestions";
import type { EventCatalog } from "@/features/participant/types";
import {
  wizardCreateSchema,
  wizardEditSchema,
  phoneCreateSchema,
  phoneEditSchema,
} from "@/features/onboarding/schemas";

// ---------- localStorage mock ----------
class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

function goodDraft(overrides?: Partial<WizardDraft>): WizardDraft {
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
      },
    ],
    consent: true,
  };
  return { ...d, ...(overrides ?? {}) };
}

// ==================================================================
// draft.ts
// ==================================================================
describe("draft: sanitizeWizardDraft", () => {
  it("mantém somente as chaves permitidas mesmo com payload contaminado", () => {
    const polluted = {
      ...goodDraft(),
      whatsapp: "(64) 99999-9999",
      email: "leak@acme.com",
      userId: "u_1",
      profileId: "p_1",
      recoveryCode: "SECRET12",
      matches: [{ id: "m1" }],
      decisions: [{ id: "d1" }],
      contact: { phone: "+55..." },
      accessToken: "eyJraWQ...",
      error: { message: "bomba" },
    };
    const clean = sanitizeWizardDraft(polluted);
    for (const k of Object.keys(clean)) {
      expect(draftAllowedKeys()).toContain(k);
    }
    const cleanKeys = Object.keys(clean).sort();
    expect(cleanKeys).toEqual(draftAllowedKeys().slice().sort());
    // Não vaza propriedades sensíveis
    for (const forbidden of [
      "whatsapp",
      "email",
      "userId",
      "profileId",
      "recoveryCode",
      "matches",
      "decisions",
      "contact",
      "accessToken",
      "error",
    ]) {
      expect(clean).not.toHaveProperty(forbidden);
    }
    // Também não contamina os offers/needs internos
    for (const o of clean.offers) {
      expect(Object.keys(o).sort()).toEqual(
        ["detail", "label", "localId", "segmentId", "taxonomyItemId"].sort(),
      );
    }
    for (const n of clean.needs) {
      const allowed = [
        "detail",
        "label",
        "localId",
        "segmentId",
        "taxonomyItemId",
        "needKind",
        "isPriority",
      ].sort();
      expect(Object.keys(n).sort()).toEqual(allowed);
    }
  });

  it("aplica limites máximos de tamanho de string", () => {
    const long = "x".repeat(999);
    const clean = sanitizeWizardDraft({ name: long });
    expect(clean.name.length).toBeLessThanOrEqual(120);
  });

  it("nunca aceita `consent` sem ser exatamente true", () => {
    expect(sanitizeWizardDraft({ consent: "true" }).consent).toBe(false);
    expect(sanitizeWizardDraft({ consent: 1 }).consent).toBe(false);
    expect(sanitizeWizardDraft({ consent: true }).consent).toBe(true);
  });

  it("filtra needKind desconhecido para 'outro'", () => {
    const c = sanitizeWizardDraft({
      needs: [
        {
          localId: "x",
          label: "l",
          segmentId: "s",
          taxonomyItemId: null,
          needKind: "hackz",
          isPriority: true,
        },
      ],
    });
    expect(c.needs[0]?.needKind).toBe("outro");
  });
});

describe("draft: save/load/clear/hasValid", () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
  });
  const NOW = new Date("2026-05-01T10:00:00Z").getTime();

  it("persistir/ler ida-e-volta preserva o rascunho", () => {
    saveWizardDraft(goodDraft(), NOW, storage);
    const loaded = loadWizardDraft(NOW, storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.draft.segmentId).toBe("servicos");
    expect(loaded!.draft.offers[0]?.taxonomyItemId).toBe("tax-1");
    expect(hasValidWizardDraft(NOW, storage)).toBe(true);
  });

  it("expira após 24h", () => {
    saveWizardDraft(goodDraft(), NOW, storage);
    const later = NOW + DRAFT_MAX_AGE_MS + 1;
    expect(loadWizardDraft(later, storage)).toBeNull();
    // Também remove do storage após expirar
    expect(storage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
  });

  it("remove chave legada sudoexpo:draft", () => {
    storage.setItem(LEGACY_DRAFT_KEY, "{}");
    purgeLegacyDraft(storage);
    expect(storage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });

  it("descartar envelope inválido também limpa o storage", () => {
    storage.setItem(WIZARD_DRAFT_KEY, "{{ nope");
    expect(loadWizardDraft(NOW, storage)).toBeNull();
    expect(storage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
  });

  it("clearWizardDraft apaga apenas a chave v2", () => {
    saveWizardDraft(goodDraft(), NOW, storage);
    storage.setItem(LEGACY_DRAFT_KEY, "keep-me-not");
    clearWizardDraft(storage);
    expect(storage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
  });

  it("envelope persistido NÃO contém WhatsApp/email/token", () => {
    saveWizardDraft(
      {
        ...goodDraft(),

        whatsapp: "(64) 99999-9999",
      } as WizardDraft,
      NOW,
      storage,
    );
    const raw = storage.getItem(WIZARD_DRAFT_KEY) ?? "";
    expect(raw).not.toMatch(/whatsapp/i);
    expect(raw).not.toMatch(/9999-9999/);
    expect(raw).not.toMatch(/@/);
    expect(raw).not.toMatch(/accessToken/i);
  });
});

// ==================================================================
// mappers.ts
// ==================================================================
describe("mappers: mapWizardToSaveProfileInput", () => {
  it("preserva taxonomy_item_id e segment_id item-a-item", () => {
    const d = goodDraft({
      offers: [
        {
          localId: "o1",
          label: "A",
          segmentId: "servicos",
          taxonomyItemId: "tax-A",
        },
        {
          localId: "o2",
          label: "B",
          segmentId: "outrosegmento",
          taxonomyItemId: null,
        },
      ],
    });
    const out = mapWizardToSaveProfileInput(d, "e1");
    expect(out.offers[0].taxonomy_item_id).toBe("tax-A");
    expect(out.offers[0].segment_id).toBe("servicos");
    expect(out.offers[1].taxonomy_item_id).toBeNull();
    expect(out.offers[1].segment_id).toBe("outrosegmento");
    expect(out.needs[0].need_kind).toBe("fornecedor");
    expect(out.needs[0].is_priority).toBe(true);
  });

  it("falha se não houver exatamente uma prioridade", () => {
    const d = goodDraft({
      needs: [
        {
          localId: "n1",
          label: "a",
          segmentId: "s",
          taxonomyItemId: null,
          needKind: "servico",
          isPriority: false,
        },
      ],
    });
    expect(() => mapWizardToSaveProfileInput(d, "e1")).toThrow(WizardMappingError);
  });

  it("falha se houver duas prioridades", () => {
    const twoPri: WizardNeed[] = [
      {
        localId: "a",
        label: "a",
        segmentId: "s",
        taxonomyItemId: null,
        needKind: "servico",
        isPriority: true,
      },
      {
        localId: "b",
        label: "b",
        segmentId: "s",
        taxonomyItemId: null,
        needKind: "fornecedor",
        isPriority: true,
      },
    ];
    expect(() => mapWizardToSaveProfileInput(goodDraft({ needs: twoPri }), "e1")).toThrow(
      WizardMappingError,
    );
  });

  it("não inclui WhatsApp/campos legados", () => {
    const out = mapWizardToSaveProfileInput(goodDraft(), "e1");
    expect(out).not.toHaveProperty("whatsapp");
    expect(out).not.toHaveProperty("recoveryCode");
    expect(out).not.toHaveProperty("kind");
    expect(out).not.toHaveProperty("isPriority");
  });

  it("normaliza strings com trim", () => {
    const out = mapWizardToSaveProfileInput(
      goodDraft({ name: "  Ana  ", company: "  Acme  " }),
      "e1",
    );
    expect(out.name).toBe("Ana");
    expect(out.company).toBe("Acme");
  });
});

describe("mappers: mapProfileToWizardDraft", () => {
  it("preserva taxonomy IDs, needKind e prioridade vindos do banco", () => {
    const profile: OwnProfileDTO = {
      id: "p",
      event_id: "e1",
      name: "Ana",
      company: "Acme",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: "servicos",
      summary: "resumo",
      consent: true,
      created_at: "x",
      updated_at: "x",
      offers: [
        {
          id: "srv-off-1",
          label: "L1",
          detail: null,
          segment_id: "servicos",
          taxonomy_item_id: "tax-1",
        },
      ],
      needs: [
        {
          id: "srv-need-1",
          label: "N1",
          detail: null,
          segment_id: "servicos",
          taxonomy_item_id: "tax-2",
          need_kind: "parceiro",
          is_priority: true,
        },
      ],
    };
    const draft = mapProfileToWizardDraft(profile);
    expect(draft.offers[0].taxonomyItemId).toBe("tax-1");
    expect(draft.needs[0].taxonomyItemId).toBe("tax-2");
    expect(draft.needs[0].needKind).toBe("parceiro");
    expect(draft.needs[0].isPriority).toBe(true);
  });
});

describe("mappers: normalizePhoneE164", () => {
  it("aceita BR 11 dígitos e adiciona +55", () => {
    expect(normalizePhoneE164("(64) 99999-9999")).toBe("+5564999999999");
  });
  it("mantém prefixo internacional se já vier com +", () => {
    expect(normalizePhoneE164("+1 555 123 4567")).toBe("+15551234567");
  });
  it("rejeita valores curtos", () => {
    expect(normalizePhoneE164("123")).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
  });
});

// ==================================================================
// schemas.ts — criar exige WhatsApp; editar aceita vazio
// ==================================================================
describe("schemas: criar vs editar", () => {
  it("criar exige WhatsApp válido", () => {
    expect(phoneCreateSchema.safeParse("").success).toBe(false);
    expect(phoneCreateSchema.safeParse("123").success).toBe(false);
    expect(phoneCreateSchema.safeParse("(64) 99999-9999").success).toBe(true);
  });
  it("editar aceita WhatsApp vazio", () => {
    expect(phoneEditSchema.safeParse("").success).toBe(true);
    expect(phoneEditSchema.safeParse("123").success).toBe(false);
    expect(phoneEditSchema.safeParse("(64) 99999-9999").success).toBe(true);
  });
  it("wizardCreateSchema aceita draft profissional válido", () => {
    expect(wizardCreateSchema.safeParse(goodDraft()).success).toBe(true);
  });
  it("wizardCreateSchema rejeita 2 prioridades", () => {
    const bad = goodDraft({
      needs: [
        { ...goodDraft().needs[0] },
        {
          ...goodDraft().needs[0],
          localId: "n2",
          label: "L2",
          isPriority: true,
        },
      ],
    });
    expect(wizardCreateSchema.safeParse(bad).success).toBe(false);
  });
  it("wizardEditSchema também exige regras profissionais", () => {
    const noOffers = { ...goodDraft(), offers: [] } as WizardDraft;
    expect(wizardEditSchema.safeParse(noOffers).success).toBe(false);
  });
});

// ==================================================================
// submitMachine.ts
// ==================================================================
describe("submitMachine: fluxo criar", () => {
  it("saving_profile → saving_contact → generating_code → awaiting → recomputing → completed", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "create", withContact: true });
    expect(s.stage).toBe("saving_profile");
    s = submitReducer(s, { type: "PROFILE_OK" });
    expect(s.stage).toBe("saving_contact");
    s = submitReducer(s, { type: "CONTACT_OK" });
    expect(s.stage).toBe("generating_code");
    s = submitReducer(s, { type: "CODE_OK", code: "ABC12345" });
    expect(s.stage).toBe("awaiting_code_confirmation");
    expect(s.recoveryCode).toBe("ABC12345");
    s = submitReducer(s, { type: "CODE_CONFIRMED" });
    expect(s.stage).toBe("recomputing_matches");
    // Código sai da memória depois da confirmação
    expect(s.recoveryCode).toBeNull();
    s = submitReducer(s, { type: "MATCH_OK" });
    expect(s.stage).toBe("completed");
    expect(isCompleted(s)).toBe(true);
  });
});

describe("submitMachine: fluxo editar pula rotação de código", () => {
  it("edit sem contato: saving_profile → recomputing → completed", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "edit", withContact: false });
    s = submitReducer(s, { type: "PROFILE_OK" });
    expect(s.stage).toBe("recomputing_matches"); // nunca passou por contato/código
    s = submitReducer(s, { type: "MATCH_OK" });
    expect(s.stage).toBe("completed");
  });
  it("edit COM contato: saving_profile → saving_contact → recomputing (nunca generating_code)", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "edit", withContact: true });
    s = submitReducer(s, { type: "PROFILE_OK" });
    expect(s.stage).toBe("saving_contact");
    s = submitReducer(s, { type: "CONTACT_OK" });
    expect(s.stage).toBe("recomputing_matches");
  });
});

describe("submitMachine: falhas parciais", () => {
  it("contact_failed → RETRY_CONTACT continua do contato (não do perfil)", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "create", withContact: true });
    s = submitReducer(s, { type: "PROFILE_OK" });
    s = submitReducer(s, { type: "CONTACT_FAIL" });
    expect(s.stage).toBe("contact_failed");
    s = submitReducer(s, { type: "RETRY_CONTACT" });
    expect(s.stage).toBe("saving_contact");
  });
  it("code_failed → RETRY_CODE continua do código (não do perfil/contato)", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "create", withContact: true });
    s = submitReducer(s, { type: "PROFILE_OK" });
    s = submitReducer(s, { type: "CONTACT_OK" });
    s = submitReducer(s, { type: "CODE_FAIL" });
    expect(s.stage).toBe("code_failed");
    s = submitReducer(s, { type: "RETRY_CODE" });
    expect(s.stage).toBe("generating_code");
  });
  it("matching_failed → aceita RETRY_MATCH ou navegação ao painel", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "edit", withContact: false });
    s = submitReducer(s, { type: "PROFILE_OK" });
    s = submitReducer(s, { type: "MATCH_FAIL" });
    expect(s.stage).toBe("matching_failed");
    const retried = submitReducer(s, { type: "RETRY_MATCH" });
    expect(retried.stage).toBe("recomputing_matches");
    // “Ir ao painel” é ação da UI — a máquina simplesmente permanece.
    expect(s.stage).toBe("matching_failed");
  });
  it("PROFILE_FAIL volta a estado clicável em Review", () => {
    let s = initialSubmitState();
    s = submitReducer(s, { type: "START", mode: "create", withContact: true });
    s = submitReducer(s, { type: "PROFILE_FAIL" });
    expect(s.stage).toBe("profile_failed");
    expect(reviewIsActionable(s)).toBe(true);
    expect(isSubmitting(s)).toBe(false);
  });
});

// ==================================================================
// suggestions.ts
// ==================================================================
const CATALOG: EventCatalog = {
  segments: [{ id: "servicos", label: "Serviços", emoji: null }],
  taxonomy: [
    {
      id: "srv-off-1",
      segment_id: "servicos",
      label: "Consultoria contábil",
      kind: "offer",
      synonyms: [],
    },
    {
      id: "srv-need-1",
      segment_id: "servicos",
      label: "Fornecedor de embalagens",
      kind: "need",
      synonyms: [],
    },
    {
      id: "srv-both-1",
      segment_id: "servicos",
      label: "Consultor tributário",
      kind: "both",
      synonyms: [],
    },
    {
      id: "outro-off-1",
      segment_id: "industria",
      label: "Produção",
      kind: "offer",
      synonyms: [],
    },
  ],
};

describe("suggestions: heurística sobre catálogo real", () => {
  it("só retorna taxonomyItemId presente no catálogo do evento", async () => {
    const r = await heuristicSuggestionProvider.suggest({
      segmentId: "servicos",
      summary: "Consultoria contábil e tributária",
      catalog: CATALOG,
    });
    const validIds = new Set(CATALOG.taxonomy.map((t) => t.id));
    for (const item of r.items) {
      if (item.taxonomyItemId !== null) {
        expect(validIds.has(item.taxonomyItemId)).toBe(true);
      }
    }
  });
  it("não sugere itens de outros segmentos", async () => {
    const r = await heuristicSuggestionProvider.suggest({
      segmentId: "servicos",
      summary: "consultoria",
      catalog: CATALOG,
    });
    expect(r.items.every((i) => i.taxonomyItemId !== "outro-off-1")).toBe(true);
  });
});

// ==================================================================
// Static guard — o wizard não importa catálogo mockado
// ==================================================================
describe("busca estática: /participar e wizard não consomem catálogo mockado", () => {
  it("não importa SEGMENTS/TAXONOMY de mock-data em routes/participar.tsx", () => {
    const out = execSync(
      'grep -nE "SEGMENTS|TAXONOMY|NEED_KIND_LABELS" src/routes/participar.tsx || true',
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
  it("o catálogo mockado (src/lib/mock-data.ts) não existe mais no repositório", () => {
    expect(existsSync("src/lib/mock-data.ts")).toBe(false);
  });
  it("wizard não usa mais useSaveOwnProfile (wrapper legado)", () => {
    const out = execSync(
      'grep -nE "useSaveOwnProfile" src/routes/participar.tsx src/features/onboarding 2>/dev/null || true',
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
  it("o adaptador antigo de IA (src/domains/ai/mock.ts) não existe mais", () => {
    expect(existsSync("src/domains/ai/mock.ts")).toBe(false);
    const out = execSync(
      'grep -rnE "domains/ai/mock" src --exclude-dir=__tests__ || true',
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
});

// ==================================================================
// Segurança extra — draft não persiste WhatsApp mesmo se um teste tentar
// ==================================================================
describe("segurança: WhatsApp nunca vai ao localStorage v2", () => {
  it("saveWizardDraft ignora campos extras injetados", () => {
    const storage = new MemStorage();
    const trojan = {
      ...goodDraft(),
      whatsapp: "(64) 99999-9999",
      accessToken: "leak",
    };
    saveWizardDraft(trojan as WizardDraft, Date.now(), storage);
    const raw = storage.getItem(WIZARD_DRAFT_KEY) ?? "";
    expect(raw.length).toBeGreaterThan(0);
    expect(raw).not.toMatch(/whatsapp/i);
    expect(raw).not.toMatch(/accessToken/);
  });
});
