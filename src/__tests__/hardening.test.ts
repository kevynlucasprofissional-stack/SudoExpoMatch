import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { cancelNoteSchema, translateStaffRevealError } from "@/features/staff/schemas";
import { translateStaffError } from "@/features/admin/useEventStaff";
import { translateRevealErrorCode as translateRevealError } from "@/features/participant/presentation";
import { canParticipantRevealContact } from "@/features/connections/eligibility";

describe("cancelNoteSchema", () => {
  it("rejeita string vazia", () => {
    expect(cancelNoteSchema.safeParse("").success).toBe(false);
  });
  it("rejeita apenas espaços", () => {
    expect(cancelNoteSchema.safeParse("   ").success).toBe(false);
  });
  it("rejeita 2 caracteres", () => {
    expect(cancelNoteSchema.safeParse("ab").success).toBe(false);
  });
  it("aceita exatamente 3 caracteres", () => {
    expect(cancelNoteSchema.safeParse("abc").success).toBe(true);
  });
  it("aceita exatamente 500 caracteres", () => {
    expect(cancelNoteSchema.safeParse("a".repeat(500)).success).toBe(true);
  });
  it("rejeita 501 caracteres", () => {
    expect(cancelNoteSchema.safeParse("a".repeat(501)).success).toBe(false);
  });
});

describe("translateStaffError (admin)", () => {
  const cases: Array<[string, RegExp]> = [
    ["last_admin", /último administrador/i],
    ["user_not_found", /não encontramos/i],
    ["already_member", /faz parte da equipe/i],
    ["already_member_different_role", /outro papel/i],
    ["forbidden", /acesso negado/i],
  ];
  for (const [code, re] of cases) {
    it(`traduz ${code}`, () => {
      expect(translateStaffError(new Error(code))).toMatch(re);
    });
  }
});

describe("translateStaffRevealError", () => {
  const cases: Array<[string, RegExp]> = [
    ["not_mutual", /mútuo/i],
    ["no_connection", /conexão registrada/i],
    ["connection_cancelled", /cancelada/i],
    ["forbidden", /acesso negado/i],
    ["not_authenticated", /sessão/i],
  ];
  for (const [code, re] of cases) {
    it(`traduz ${code}`, () => {
      expect(translateStaffRevealError(new Error(code))).toMatch(re);
    });
  }
});

describe("translateRevealError (participante)", () => {
  it("not_mutual", () => expect(translateRevealError("not_mutual")).toMatch(/mútuo/i));
  it("not_yet_introduced", () =>
    expect(translateRevealError("not_yet_introduced")).toMatch(/apresentar/i));
  it("contact_sharing_disabled", () =>
    expect(translateRevealError("contact_sharing_disabled")).toMatch(/desativou/i));
  it("contact_unavailable", () =>
    expect(translateRevealError("contact_unavailable")).toMatch(/disponibilizado|disponível/i));
  it("network", () => expect(translateRevealError("network")).toMatch(/conexão/i));
});

describe("canParticipantRevealContact", () => {
  it("false para undefined", () => expect(canParticipantRevealContact(undefined)).toBe(false));
  it("false para aguardando", () => expect(canParticipantRevealContact("aguardando")).toBe(false));
  it("false para em_atendimento", () =>
    expect(canParticipantRevealContact("em_atendimento")).toBe(false));
  it("false para cancelado", () => expect(canParticipantRevealContact("cancelado")).toBe(false));
  it("true para apresentados", () =>
    expect(canParticipantRevealContact("apresentados")).toBe(true));
  it("true para contato_trocado", () =>
    expect(canParticipantRevealContact("contato_trocado")).toBe(true));
  it("true para concluido", () => expect(canParticipantRevealContact("concluido")).toBe(true));
});

describe("source hygiene (recovery code não persistido)", () => {
  const FORBIDDEN = ["sudoexpo:lastCode", "LAST_CODE_KEY", "consumeLastRecoveryCode"];
  // walk src, ignore generated types and tests themselves
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx)$/.test(name) && !full.endsWith(".gen.ts")) out.push(full);
    }
    return out;
  }
  const files = walk(path.resolve(__dirname, ".."));

  for (const needle of FORBIDDEN) {
    it(`nenhum arquivo em src/ contém "${needle}"`, () => {
      const hits = files
        .filter((f) => !f.includes(path.sep + "__tests__" + path.sep))
        .filter((f) => readFileSync(f, "utf8").includes(needle));
      expect(hits).toEqual([]);
    });
  }

  it("nenhum localStorage.setItem recebe recovery code", () => {
    // Regex procura chamadas localStorage.setItem(..., recovery / recoveryCode / code...)
    const re = /localStorage\.setItem\([^)]*(recoveryCode|recovery_code|lastCode)/i;
    const hits = files
      .filter((f) => !f.includes(path.sep + "__tests__" + path.sep))
      .filter((f) => re.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
