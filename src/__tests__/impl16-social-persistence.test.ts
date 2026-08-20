import { describe, expect, it } from "vitest";
import {
  buildSocialLinkPayload,
  hasForbiddenSocialKey,
  participantSocialSchema,
  readStringList,
  readText,
} from "@/features/social/socialProfile";
import { runWizardSubmit, type SubmitEvent } from "@/features/onboarding/submitOrchestrator";
import { createEmptyDraft } from "@/features/onboarding/draft";
import type { WizardDraft } from "@/features/onboarding/types";
import type { SocialBusinessContext } from "@/lib/social-context";

const EVENT = "sudoexpo-2026";

const ctx: SocialBusinessContext = {
  provider: "instagram_public",
  handle: "empresaxyz",
  displayName: "Empresa XYZ",
  category: "Restaurante",
  bio: "Delivery e encomendas para eventos",
  keywords: ["delivery", "eventos"],
  signals: ["faz delivery/entrega"],
  fetchedAt: new Date().toISOString(),
  truncated: false,
};

function draftFor(instagram: string): WizardDraft {
  return {
    ...createEmptyDraft(),
    name: "Ana",
    company: "XYZ",
    city: "Rio Verde",
    segmentId: "alimentacao",
    businessSize: "pequeno",
    businessType: "comercio",
    niche: "marmitas",
    summary: "Restaurante com delivery próprio na cidade.",
    instagram,
    consent: true,
    offers: [
      {
        localId: "o1",
        label: "Marmitas congeladas",
        segmentId: "alimentacao",
        taxonomyItemId: null,
      },
    ],
    needs: [
      {
        localId: "n1",
        label: "Fornecedor de embalagens",
        segmentId: "alimentacao",
        taxonomyItemId: null,
        needKind: "fornecedor",
        isPriority: true,
      },
    ],
  };
}

describe("payload de vínculo social", () => {
  it("Instagram informado SEM análise ainda persiste o @", () => {
    const p = buildSocialLinkPayload({ eventId: EVENT, instagram: "@EmpresaXYZ" });
    expect(p.handle).toBe("empresaxyz");
    expect(p.last_status).toBe("informed");
    expect(p.extracted_context).toBeNull();
  });

  it("Instagram informado COM contexto persiste o contexto estruturado", () => {
    const p = buildSocialLinkPayload({
      eventId: EVENT,
      instagram: "https://www.instagram.com/empresaxyz/",
      context: ctx,
    });
    expect(p.handle).toBe("empresaxyz");
    expect(p.last_status).toBe("ok");
    expect(readStringList(p.extracted_context, "keywords")).toContain("delivery");
    expect(readText(p.public_profile, "display_name")).toBe("Empresa XYZ");
    expect(p.content_fingerprint).toBeTruthy();
  });

  it("contexto de outro handle não é reaproveitado", () => {
    const p = buildSocialLinkPayload({ eventId: EVENT, instagram: "@outraempresa", context: ctx });
    expect(p.handle).toBe("outraempresa");
    expect(p.extracted_context).toBeNull();
    expect(p.last_status).toBe("informed");
  });

  it("remoção do Instagram gera payload de desvínculo", () => {
    const p = buildSocialLinkPayload({ eventId: EVENT, instagram: "   " });
    expect(p.handle).toBeNull();
  });

  it("entrada fora do instagram.com é rejeitada (anti-SSRF)", () => {
    const p = buildSocialLinkPayload({ eventId: EVENT, instagram: "https://evil.com/empresaxyz" });
    expect(p.handle).toBeNull();
  });

  it("payload nunca carrega HTML, token ou segredo", () => {
    const p = buildSocialLinkPayload({ eventId: EVENT, instagram: "@empresaxyz", context: ctx });
    expect(hasForbiddenSocialKey(p)).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/<html|cookie|access_token/i);
    expect(hasForbiddenSocialKey({ cache: { raw_html: "<html>" } })).toBe(true);
  });
});

describe("submit do wizard persiste o Instagram", () => {
  async function run(instagram: string, socialContext: SocialBusinessContext | null) {
    const calls: unknown[] = [];
    const events: SubmitEvent[] = await runWizardSubmit({
      draft: draftFor(instagram),
      mode: "edit",
      phone: "+5564999999999",
      eventId: EVENT,
      socialContext,
      deps: {
        saveOwnProfile: async () => "profile-1",
        setOwnContact: async () => undefined,
        rotateOwnRecoveryCode: async () => "AAAA-BBBB",
        linkSocialProfile: async (payload) => {
          calls.push(payload);
          return { status: "linked" };
        },
      },
    });
    return { calls, events };
  }

  it("cria perfil e vincula o @ mesmo sem análise", async () => {
    const { calls, events } = await run("@empresaxyz", null);
    expect(events.some((e) => e.type === "PROFILE_OK")).toBe(true);
    expect(events.find((e) => e.type === "SOCIAL_OK")).toMatchObject({
      handle: "empresaxyz",
      status: "informed",
    });
    expect(calls).toHaveLength(1);
  });

  it("vincula com snapshot de contexto quando há análise", async () => {
    const { calls } = await run("@empresaxyz", ctx);
    const payload = calls[0] as { last_status: string; extracted_context: unknown };
    expect(payload.last_status).toBe("ok");
    expect(readStringList(payload.extracted_context, "signals")).toHaveLength(1);
  });

  it("edição trocando o @ envia o novo handle", async () => {
    const { calls } = await run("@novaempresa", ctx);
    expect((calls[0] as { handle: string }).handle).toBe("novaempresa");
  });

  it("edição removendo o @ envia desvínculo", async () => {
    const { calls } = await run("", null);
    expect((calls[0] as { handle: string | null }).handle).toBeNull();
  });

  it("falha ao vincular NUNCA bloqueia o cadastro", async () => {
    const events = await runWizardSubmit({
      draft: draftFor("@empresaxyz"),
      mode: "edit",
      phone: "+5564999999999",
      eventId: EVENT,
      socialContext: ctx,
      deps: {
        saveOwnProfile: async () => "profile-1",
        setOwnContact: async () => undefined,
        rotateOwnRecoveryCode: async () => "AAAA-BBBB",
        linkSocialProfile: async () => {
          throw new Error("boom");
        },
      },
    });
    expect(events.some((e) => e.type === "SOCIAL_FAIL")).toBe(true);
    expect(events.some((e) => e.type === "MATCH_OK")).toBe(true);
  });

  it("sem dependência de social o fluxo antigo segue idêntico (sem regressão)", async () => {
    const events = await runWizardSubmit({
      draft: draftFor("@empresaxyz"),
      mode: "edit",
      phone: "+5564999999999",
      eventId: EVENT,
      deps: {
        saveOwnProfile: async () => "profile-1",
        setOwnContact: async () => undefined,
        rotateOwnRecoveryCode: async () => "AAAA-BBBB",
      },
    });
    expect(events.some((e) => e.type.startsWith("SOCIAL"))).toBe(false);
    expect(events.at(-1)?.type).toBe("MATCH_OK");
  });
});

describe("leitura autorizada (contrato de resposta)", () => {
  const adminPayload = {
    profile: {
      id: "11111111-1111-1111-1111-111111111111",
      event_id: EVENT,
      business_size: "pequeno",
      business_type: "comercio",
      niche: "marmitas",
      segment_id: "alimentacao",
      summary: "Restaurante com delivery",
    },
    social: {
      network: "instagram",
      handle: "empresaxyz",
      original_input: "@EmpresaXYZ",
      canonical_url: "https://www.instagram.com/empresaxyz/",
      context_snapshot: { keywords: ["delivery"], signals: ["faz delivery/entrega"] },
      analysis_snapshot: { resumo: "restaurante" },
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cache: {
        network: "instagram",
        handle: "empresaxyz",
        canonical_url: "https://www.instagram.com/empresaxyz/",
        provider: "instagram_public",
        provider_version: null,
        public_profile: { display_name: "Empresa XYZ" },
        extracted_context: { keywords: ["delivery"] },
        ai_analysis: { resumo: "restaurante" },
        ai_prompt_version: "v7",
        ai_model: "google/gemini-2.5-flash",
        content_fingerprint: "abc",
        fetched_at: new Date().toISOString(),
        analyzed_at: null,
        expires_at: null,
        last_status: "ok",
        last_error_code: null,
        updated_at: new Date().toISOString(),
      },
    },
  };

  it("admin recebe contexto completo, com porte/tipo/nicho", () => {
    const parsed = participantSocialSchema.parse(adminPayload);
    expect(parsed.profile.business_size).toBe("pequeno");
    expect(parsed.profile.niche).toBe("marmitas");
    expect(parsed.social?.cache?.ai_analysis).toBeTruthy();
  });

  it("resposta da equipe (sem análise de IA) também é válida", () => {
    const staffPayload = {
      ...adminPayload,
      social: {
        ...adminPayload.social,
        analysis_snapshot: null,
        cache: { ...adminPayload.social.cache, ai_analysis: null, ai_model: null },
      },
    };
    const parsed = participantSocialSchema.parse(staffPayload);
    expect(parsed.social?.cache?.ai_analysis).toBeNull();
  });

  it("participante sem Instagram devolve social nulo", () => {
    const parsed = participantSocialSchema.parse({ ...adminPayload, social: null });
    expect(parsed.social).toBeNull();
  });

  it("nenhum campo sensível aparece no contrato admin", () => {
    expect(hasForbiddenSocialKey(adminPayload)).toBe(false);
  });
});
