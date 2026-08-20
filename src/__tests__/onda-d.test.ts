import { describe, expect, it } from "vitest";
import {
  CONNECTION_STATUS_LABEL,
  NEXT_CONNECTION_STATUS,
  canAssume,
  canOperate,
  canRevealContact,
  isTerminalStatus,
  translateOperationalError,
} from "@/features/connections/domain";
import { formatDurationSeconds } from "@/features/staff/useOperationalStats";

describe("Onda D — connections domain", () => {
  it("cobre todos os status", () => {
    const keys = Object.keys(CONNECTION_STATUS_LABEL);
    expect(keys).toHaveLength(6);
    expect(keys).toContain("aguardando");
    expect(keys).toContain("concluido");
  });

  it("máquina linear NEXT_CONNECTION_STATUS", () => {
    expect(NEXT_CONNECTION_STATUS.aguardando).toBe("em_atendimento");
    expect(NEXT_CONNECTION_STATUS.em_atendimento).toBe("apresentados");
    expect(NEXT_CONNECTION_STATUS.apresentados).toBe("contato_trocado");
    expect(NEXT_CONNECTION_STATUS.contato_trocado).toBe("concluido");
    expect(NEXT_CONNECTION_STATUS.concluido).toBeNull();
    expect(NEXT_CONNECTION_STATUS.cancelado).toBeNull();
  });

  it("isTerminalStatus", () => {
    expect(isTerminalStatus("concluido")).toBe(true);
    expect(isTerminalStatus("cancelado")).toBe(true);
    expect(isTerminalStatus("aguardando")).toBe(false);
  });

  it("canAssume apenas quando aguardando e livre", () => {
    expect(canAssume("aguardando", null)).toBe(true);
    expect(canAssume("aguardando", "user-1")).toBe(false);
    expect(canAssume("em_atendimento", null)).toBe(false);
  });

  it("canRevealContact bloqueia antes de apresentados", () => {
    expect(canRevealContact("aguardando")).toBe(false);
    expect(canRevealContact("em_atendimento")).toBe(false);
    expect(canRevealContact("apresentados")).toBe(true);
    expect(canRevealContact("contato_trocado")).toBe(true);
    expect(canRevealContact("concluido")).toBe(true);
    expect(canRevealContact("cancelado")).toBe(false);
  });

  describe("canOperate", () => {
    it("admin sempre opera fora de estados terminais", () => {
      expect(
        canOperate({
          status: "aguardando",
          assignedTo: "outro",
          userId: "eu",
          isAdmin: true,
        }),
      ).toBe(true);
      expect(
        canOperate({
          status: "concluido",
          assignedTo: "eu",
          userId: "eu",
          isAdmin: true,
        }),
      ).toBe(false);
    });
    it("staff só opera se for o responsável", () => {
      expect(
        canOperate({
          status: "em_atendimento",
          assignedTo: "eu",
          userId: "eu",
          isAdmin: false,
        }),
      ).toBe(true);
      expect(
        canOperate({
          status: "em_atendimento",
          assignedTo: "outro",
          userId: "eu",
          isAdmin: false,
        }),
      ).toBe(false);
    });
    it("sem userId nunca opera", () => {
      expect(
        canOperate({
          status: "em_atendimento",
          assignedTo: "eu",
          userId: null,
          isAdmin: true,
        }),
      ).toBe(false);
    });
  });

  describe("translateOperationalError", () => {
    it("traduz códigos comuns", () => {
      expect(translateOperationalError(new Error("already_assigned"))).toMatch(
        /assumiu esta conexão/,
      );
      expect(translateOperationalError(new Error("not_assignee"))).toMatch(/assumiu/);
      expect(translateOperationalError(new Error("has_active_connections:3"))).toMatch(
        /conexões ativas/,
      );
      expect(translateOperationalError(new Error("invalid_transition:foo->bar"))).toMatch(
        /Transição inválida/,
      );
      expect(translateOperationalError(new Error("note_required"))).toMatch(
        /observação de 3 a 500/,
      );
      expect(translateOperationalError(new Error("reveal_not_allowed"))).toMatch(/Apresentados/);
      expect(translateOperationalError(new Error("forbidden"))).toMatch(/Acesso negado/);
    });
    it("fallback é seguro", () => {
      expect(translateOperationalError(null)).toMatch(/Falha inesperada/);
    });
  });
});

describe("Onda D — formatDurationSeconds", () => {
  it("formata s/min/h", () => {
    expect(formatDurationSeconds(0)).toBe("—");
    expect(formatDurationSeconds(45)).toBe("45s");
    expect(formatDurationSeconds(120)).toBe("2min");
    expect(formatDurationSeconds(3600)).toBe("1h");
    expect(formatDurationSeconds(3660)).toBe("1h1min");
  });
});
