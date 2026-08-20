import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { createEmptyDraft } from "@/features/onboarding/draft";
import { validateWizardForSubmit } from "@/features/onboarding/validate";
import type { WizardDraft } from "@/features/onboarding/types";

function validDraft(summary: string): WizardDraft {
  return {
    ...createEmptyDraft(),
    name: "Ana",
    company: "Empresa XYZ",
    city: "Rio do Sul",
    businessSize: "pequeno",
    businessType: "servico",
    segmentId: "servicos",
    summary,
    offers: [{ localId: "o1", label: "Consultoria", segmentId: "servicos", taxonomyItemId: null }],
    needs: [
      {
        localId: "n1",
        label: "Contador",
        segmentId: "servicos",
        taxonomyItemId: null,
        needKind: "servico",
        isPriority: true,
      },
    ],
    consent: true,
  };
}

const PHONE = "+5547999999999";

describe("Resumo sem mínimo de caracteres", () => {
  for (const summary of ["A", "Loja", "Advogado", "Restaurante", "Vendo roupas"]) {
    it(`aceita resumo "${summary}"`, () => {
      const res = validateWizardForSubmit({
        draft: validDraft(summary),
        mode: "create",
        phone: PHONE,
      });
      expect(res.ok).toBe(true);
    });
  }

  it("resumo vazio (ou só espaços) continua inválido", () => {
    for (const s of ["", "   "]) {
      const res = validateWizardForSubmit({ draft: validDraft(s), mode: "create", phone: PHONE });
      expect(res.ok).toBe(false);
    }
  });

  it("mantém o limite de 500 caracteres", () => {
    const res = validateWizardForSubmit({
      draft: validDraft("x".repeat(501)),
      mode: "create",
      phone: PHONE,
    });
    expect(res.ok).toBe(false);
  });

  it("modo edição também aceita resumo curto", () => {
    const res = validateWizardForSubmit({ draft: validDraft("A"), mode: "edit", phone: "" });
    expect(res.ok).toBe(true);
  });
});

describe("Código sem resquícios do mínimo 20", () => {
  const schemas = readFileSync("src/features/onboarding/schemas.ts", "utf8");
  const steps = readFileSync("src/features/onboarding/steps.tsx", "utf8");

  it("schemas não exigem 20 caracteres", () => {
    expect(schemas).not.toMatch(/min\(20/);
    expect(schemas).not.toMatch(/Resumo curto demais/);
  });

  it("StepWhoIAm não bloqueia por comprimento e não mostra 'Mínimo 20'", () => {
    expect(steps).not.toContain("Mínimo 20");
    expect(steps).not.toMatch(/summary\.trim\(\)\.length >= 20/);
    expect(steps).toMatch(/summary\.trim\(\)\.length > 0/);
  });
});

describe("Etapa 2 — Instagram automático preservado", () => {
  const page = readFileSync("src/routes/participar.tsx", "utf8");
  const steps = readFileSync("src/features/onboarding/steps.tsx", "utf8");

  it("não existe botão manual 'Analisar perfil'", () => {
    expect(steps).not.toContain("Analisar perfil");
    expect(page).not.toContain("Analisar perfil");
  });

  it("o enriquecimento continua acoplado ao Continuar da etapa 2", () => {
    expect(page).toContain("shouldRunSocialEnrichment");
    expect(page).toContain("analyzeSocialProfile");
  });
});
