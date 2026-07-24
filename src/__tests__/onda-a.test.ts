import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { qk } from "@/features/participant/queryKeys";
import {
  ownMatchSchema,
  ownProfileSchema,
  decideMatchResultSchema,
  revealedContactSchema,
  recomputeResultSchema,
  saveOwnProfilePayloadSchema,
} from "@/features/participant/schemas";
import { eventCatalogSchema } from "@/features/taxonomy/schemas";
import { recoverProfileResponseSchema } from "@/features/recovery/schemas";
import {
  LABEL_TEXT,
  DECISION_TEXT,
  KIND_TEXT,
  isMutualInterest,
} from "@/features/matching/presentation";
import { extractErrorCode, ApiError } from "@/features/participant/api";
import { translateRecoverErrorCode } from "@/features/recovery/api";
import type { ErrorCode } from "@/features/participant/types";

// ---------- Query keys ----------
describe("query keys centralizadas", () => {
  it("emitem chaves estáveis e comparáveis", () => {
    expect(qk.taxonomy("e1")).toEqual(["taxonomy", "e1"]);
    expect(qk.ownProfile("e1")).toEqual(["own-profile", "e1"]);
    expect(qk.ownMatches("e1")).toEqual(["own-matches", "e1"]);
    expect(qk.publicStats("e1")).toEqual(["stats", "e1"]);
    expect(qk.staffQueue("e1")).toEqual(["staff-queue", "e1"]);
  });
  it("chaves diferem por evento", () => {
    expect(qk.ownMatches("a")).not.toEqual(qk.ownMatches("b"));
  });
});

// ---------- Catálogo ----------
describe("eventCatalogSchema", () => {
  it("aceita payload completo do banco", () => {
    const ok = eventCatalogSchema.safeParse({
      segments: [{ id: "s1", label: "Serviços", emoji: "🛠️" }],
      taxonomy: [
        {
          id: "t1",
          segment_id: "s1",
          label: "Manutenção",
          kind: "offer",
          synonyms: ["reparo"],
        },
      ],
    });
    expect(ok.success).toBe(true);
  });
  it("aceita emoji null", () => {
    const r = eventCatalogSchema.safeParse({
      segments: [{ id: "s1", label: "X", emoji: null }],
      taxonomy: [],
    });
    expect(r.success).toBe(true);
  });
  it("rejeita kind inválido", () => {
    const r = eventCatalogSchema.safeParse({
      segments: [],
      taxonomy: [{ id: "t", segment_id: "s", label: "x", kind: "wrong", synonyms: [] }],
    });
    expect(r.success).toBe(false);
  });
});

// ---------- Perfil ----------
describe("ownProfileSchema", () => {
  const valid = {
    id: "p",
    event_id: "e",
    name: "N",
    company: "C",
    city: "Rio Verde",
    neighborhood: null,
    segment_id: "servicos",
    summary: "resumo",
    consent: true,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    offers: [
      {
        id: "o",
        label: "Consultoria",
        detail: null,
        segment_id: "servicos",
        taxonomy_item_id: null,
      },
    ],
    needs: [
      {
        id: "n",
        label: "Fornecedor",
        detail: null,
        segment_id: "servicos",
        taxonomy_item_id: "t1",
        need_kind: "fornecedor" as const,
        is_priority: true,
      },
    ],
  };
  it("aceita payload válido", () => {
    expect(ownProfileSchema.safeParse(valid).success).toBe(true);
  });
  it("rejeita need_kind inválido", () => {
    const bad = {
      ...valid,
      needs: [{ ...valid.needs[0], need_kind: "banana" }],
    };
    expect(ownProfileSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------- Matches ----------
describe("ownMatchSchema", () => {
  const base = {
    match_id: "m",
    my_profile_id: "me",
    other_profile_id: "you",
    kind: "direto" as const,
    label: "alta_compatibilidade" as const,
    score_me: 80,
    score_other: 40,
    created_at: "x",
    updated_at: "x",
    generated_at: "x",
    other: {
      name: "N",
      company: "C",
      city: "X",
      neighborhood: null,
      segment_id: "s",
      summary: "y",
    },
    other_offers: [],
    other_needs: [],
    reasons: [{ code: "prioridade", label: "Prio", weight: 10 }],
    my_decision: "sem_decisao" as const,
    other_decision: "sem_decisao" as const,
    connection: null,
  };
  it("aceita payload correto", () => {
    expect(ownMatchSchema.safeParse(base).success).toBe(true);
  });
  it("aceita connection com status válido", () => {
    const withConn = {
      ...base,
      connection: { id: "c", status: "aguardando" as const, notes: null },
    };
    expect(ownMatchSchema.safeParse(withConn).success).toBe(true);
  });
  it("rejeita label desconhecido", () => {
    expect(
      ownMatchSchema.safeParse({ ...base, label: "impossivel" }).success,
    ).toBe(false);
  });
});

// ---------- Decisão ----------
describe("decideMatchResultSchema", () => {
  it("aceita payload sem conexão", () => {
    expect(
      decideMatchResultSchema.safeParse({
        my_decision: "interesse",
        other_decision: "sem_decisao",
        mutual: false,
        connection_id: null,
        connection_status: null,
        connection_created: false,
      }).success,
    ).toBe(true);
  });
  it("rejeita mutual não booleano", () => {
    expect(
      decideMatchResultSchema.safeParse({
        my_decision: "interesse",
        other_decision: "interesse",
        mutual: "sim",
        connection_id: "c",
        connection_status: "aguardando",
        connection_created: true,
      }).success,
    ).toBe(false);
  });
});

// ---------- Recompute ----------
describe("recomputeResultSchema", () => {
  it("aceita inteiro >= 0", () => {
    expect(recomputeResultSchema.safeParse(0).success).toBe(true);
    expect(recomputeResultSchema.safeParse(42).success).toBe(true);
  });
  it("rejeita negativo/decimal", () => {
    expect(recomputeResultSchema.safeParse(-1).success).toBe(false);
    expect(recomputeResultSchema.safeParse(1.5).success).toBe(false);
  });
});

// ---------- Reveal ----------
describe("revealedContactSchema", () => {
  it("aceita e-mail null", () => {
    expect(
      revealedContactSchema.safeParse({
        phone_e164: "+5564",
        email: null,
        name: "N",
        company: "C",
      }).success,
    ).toBe(true);
  });
});

// ---------- Recover ----------
describe("recoverProfileResponseSchema", () => {
  it("aceita array de um elemento", () => {
    expect(
      recoverProfileResponseSchema.safeParse([
        { profile_id: "p", new_recovery_code: "ABC12345" },
      ]).success,
    ).toBe(true);
  });
  it("rejeita array vazio", () => {
    expect(recoverProfileResponseSchema.safeParse([]).success).toBe(false);
  });
});

// ---------- Save payload ----------
describe("saveOwnProfilePayloadSchema", () => {
  const ok = {
    event_id: "e",
    name: "N",
    company: "C",
    city: "X",
    neighborhood: null,
    segment_id: "s",
    summary: "y",
    consent: true as const,
    policy_version: "1",
    offers: [{ label: "L", detail: null, segment_id: "s", taxonomy_item_id: null }],
    needs: [
      {
        label: "L",
        detail: null,
        segment_id: "s",
        taxonomy_item_id: null,
        need_kind: "servico" as const,
        is_priority: false,
      },
    ],
  };
  it("aceita payload mínimo válido", () => {
    expect(saveOwnProfilePayloadSchema.safeParse(ok).success).toBe(true);
  });
  it("rejeita consent = false", () => {
    expect(
      saveOwnProfilePayloadSchema.safeParse({ ...ok, consent: false }).success,
    ).toBe(false);
  });
  it("rejeita >5 ofertas", () => {
    expect(
      saveOwnProfilePayloadSchema.safeParse({
        ...ok,
        offers: Array(6).fill(ok.offers[0]),
      }).success,
    ).toBe(false);
  });
  it("rejeita 0 necessidades", () => {
    expect(
      saveOwnProfilePayloadSchema.safeParse({ ...ok, needs: [] }).success,
    ).toBe(false);
  });
});

// ---------- Presentation ----------
describe("presentation labels", () => {
  it("LABEL_TEXT cobre todos os MatchLabel", () => {
    expect(Object.keys(LABEL_TEXT).sort()).toEqual(
      ["alta_compatibilidade", "boa_oportunidade", "conexao_possivel"].sort(),
    );
  });
  it("DECISION_TEXT cobre todas as Decisions", () => {
    expect(Object.keys(DECISION_TEXT).sort()).toEqual(
      ["agora_nao", "interesse", "sem_decisao"].sort(),
    );
  });
  it("KIND_TEXT cobre todos os MatchKind", () => {
    expect(Object.keys(KIND_TEXT).length).toBe(5);
  });
  it("isMutualInterest usa decisões, não connection", () => {
    expect(isMutualInterest("interesse", "interesse")).toBe(true);
    expect(isMutualInterest("interesse", "sem_decisao")).toBe(false);
    expect(isMutualInterest("agora_nao", "interesse")).toBe(false);
  });
});

// ---------- extractErrorCode ----------
describe("extractErrorCode", () => {
  it("reconhece códigos conhecidos", () => {
    expect(extractErrorCode("rate_limited")).toBe("rate_limited");
    expect(extractErrorCode("some prefix invalid_code some suffix")).toBe(
      "invalid_code",
    );
    expect(extractErrorCode("Failed to fetch")).toBe("network");
  });
  it("retorna unknown como fallback", () => {
    expect(extractErrorCode("bla bla")).toBe("unknown");
  });
  it("nunca vaza mensagem original", () => {
    const code = extractErrorCode("secret payload data 1234");
    expect(code).toBe("unknown");
    expect(code).not.toContain("secret");
  });
});

// ---------- Recovery translations ----------
describe("translateRecoverErrorCode", () => {
  const codes: ErrorCode[] = [
    "not_found",
    "invalid_code",
    "no_recovery",
    "locked",
    "rate_limited",
    "demo_not_recoverable",
    "current_user_already_has_profile",
    "recovery_not_configured",
    "not_authenticated",
    "sign_in_failed",
    "event_not_active",
    "invalid_input",
    "network",
    "unknown",
  ];
  it("traduz TODOS os códigos exigidos sem devolver o próprio código", () => {
    for (const c of codes) {
      const msg = translateRecoverErrorCode(c);
      expect(msg.length).toBeGreaterThan(4);
      expect(msg).not.toBe(c);
    }
  });
});

// ---------- Session error propagation ----------
vi.mock("@/integrations/supabase/client", () => {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInAnonymously: vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: "boom" } }),
  };
  return { supabase: { auth } };
});

describe("ensureParticipantSession", () => {
  beforeEach(() => vi.resetModules());
  it("propaga SessionError quando signInAnonymously falha", async () => {
    const { ensureParticipantSession, SessionError } = await import(
      "@/features/participant/session"
    );
    await expect(ensureParticipantSession()).rejects.toBeInstanceOf(SessionError);
  });
  it("SessionError code = sign_in_failed", async () => {
    const { ensureParticipantSession } = await import(
      "@/features/participant/session"
    );
    try {
      await ensureParticipantSession();
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect((err as { code: string }).code).toBe("sign_in_failed");
    }
  });
});

// ---------- Static guard: nenhuma rota importa domains/matching/score ----------
describe("busca estática: score.ts nunca importado por rotas/componentes", () => {
  it("nenhum arquivo em src/routes ou src/components importa domains/matching/score", () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const out = execSync(
      "grep -rEn \"from ['\\\"](@/)?domains/matching/score\" src/routes src/components src/features || true",
      { encoding: "utf8" },
    );
    const clean = out
      .split("\n")
      .filter((l) => l && !l.includes("__tests__"))
      .join("\n");
    expect(clean).toBe("");
  });
});

// Marker para checar que ApiError é utilizável.
describe("ApiError", () => {
  it("expõe code sanitizado", () => {
    const e = new ApiError("rate_limited");
    expect(e.code).toBe("rate_limited");
    expect(e.message).toBe("rate_limited");
  });
});
