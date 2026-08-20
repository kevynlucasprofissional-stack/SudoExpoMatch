import { describe, expect, it } from "vitest";
import {
  equipeSearchSchema,
  normalizeEquipeSearch,
  segmentsToParam,
} from "@/features/staff/urlState";
import {
  cancelNoteSchema,
  adminRevealOverrideSchema,
  optionalStaffNoteSchema,
  translateStaffRevealError,
} from "@/features/staff/schemas";
import { parseActiveConnectionsCount, translateStaffError } from "@/features/admin/useEventStaff";

describe("Onda D — hardening — URL search state", () => {
  it("aplica defaults quando URL vazia", () => {
    const parsed = equipeSearchSchema.parse({});
    const n = normalizeEquipeSearch(parsed);
    expect(n).toEqual({
      scope: "pending",
      status: "all",
      sort: "priority",
      q: "",
      segments: [],
      page: 1,
    });
  });

  it("neutraliza valores inválidos (allowlist estrita)", () => {
    const parsed = equipeSearchSchema.parse({
      scope: "xpto",
      status: "unknown_status",
      sort: "bogus",
      page: -5,
    });
    const n = normalizeEquipeSearch(parsed);
    expect(n.scope).toBe("pending");
    expect(n.status).toBe("all");
    expect(n.sort).toBe("priority");
    expect(n.page).toBe(1);
  });

  it("aceita valores válidos", () => {
    const n = normalizeEquipeSearch(
      equipeSearchSchema.parse({
        scope: "mine",
        status: "em_atendimento",
        sort: "waiting",
        q: "ACME",
        segments: "comercio,industria",
        page: "3",
      }),
    );
    expect(n.scope).toBe("mine");
    expect(n.status).toBe("em_atendimento");
    expect(n.sort).toBe("waiting");
    expect(n.q).toBe("ACME");
    expect(n.segments).toEqual(["comercio", "industria"]);
    expect(n.page).toBe(3);
  });

  it("clamp de page e segments", () => {
    const many = Array.from({ length: 100 }, (_, i) => `s${i}`).join(",");
    const n = normalizeEquipeSearch(equipeSearchSchema.parse({ page: 999999, segments: many }));
    expect(n.page).toBeLessThanOrEqual(9999);
    expect(n.segments.length).toBe(25);
  });

  it("segmentsToParam ignora vazios", () => {
    expect(segmentsToParam(["a", "", "b", ""])).toBe("a,b");
    expect(segmentsToParam([])).toBe("");
  });
});

describe("Onda D — hardening — schemas de operação", () => {
  it("cancel exige 3–500 chars", () => {
    expect(cancelNoteSchema.safeParse("ab").success).toBe(false);
    expect(cancelNoteSchema.safeParse("ok mesmo").success).toBe(true);
    expect(cancelNoteSchema.safeParse("x".repeat(501)).success).toBe(false);
  });

  it("adminRevealOverride exige justificativa mínima", () => {
    expect(adminRevealOverrideSchema.safeParse("ab").success).toBe(false);
    expect(adminRevealOverrideSchema.safeParse("participante pediu urgência").success).toBe(true);
  });

  it("optionalStaffNote aceita vazio/undefined", () => {
    expect(optionalStaffNoteSchema.parse(undefined)).toBeUndefined();
    expect(optionalStaffNoteSchema.parse("")).toBeUndefined();
    expect(optionalStaffNoteSchema.parse("nota curta")).toBe("nota curta");
  });
});

describe("Onda D — hardening — tradução de erros", () => {
  it("reveal traduz códigos conhecidos", () => {
    expect(translateStaffRevealError(new Error("not_mutual"))).toMatch(/interesse mútuo/);
    expect(translateStaffRevealError(new Error("override_reason_required"))).toMatch(
      /[Jj]ustificativa/,
    );
    expect(translateStaffRevealError(new Error("connection_cancelled"))).toMatch(/cancelada/);
  });

  it("parseActiveConnectionsCount extrai N do erro do banco", () => {
    expect(parseActiveConnectionsCount(new Error("has_active_connections:7"))).toBe(7);
    expect(parseActiveConnectionsCount(new Error("outro erro"))).toBeNull();
  });

  it("translateStaffError menciona a contagem", () => {
    const msg = translateStaffError(new Error("has_active_connections:3"));
    expect(msg).toMatch(/3/);
    expect(msg).toMatch(/reatribu|receber/i);
  });

  it("translateStaffError trata invalid_reassignee e self_removal", () => {
    expect(translateStaffError(new Error("invalid_reassignee"))).toMatch(/não faz parte da equipe/);
    expect(translateStaffError(new Error("self_removal_confirmation_required"))).toMatch(
      /[Cc]onfirme/,
    );
  });
});
