import { describe, expect, it } from "vitest";
import {
  ADVANCE_CTA_LABEL,
  advanceCtaLabel,
  canAddInternalNote,
  isTerminalStatus,
} from "@/features/connections/domain";
import {
  formatDurationPt,
  formatDurationShortPt,
  secondsSince,
  stageStartAt,
} from "@/features/connections/time";
import type { ConnectionStatus } from "@/lib/types";

describe("Onda D — acabamento final", () => {
  describe("labels contextuais exatos (spec)", () => {
    it("aguardando → Assumir atendimento", () => {
      expect(advanceCtaLabel("aguardando")).toBe("Assumir atendimento");
    });
    it("em_atendimento → Marcar como apresentados", () => {
      expect(advanceCtaLabel("em_atendimento")).toBe("Marcar como apresentados");
    });
    it("apresentados → Registrar troca de contato", () => {
      expect(advanceCtaLabel("apresentados")).toBe("Registrar troca de contato");
    });
    it("contato_trocado → Concluir conexão", () => {
      expect(advanceCtaLabel("contato_trocado")).toBe("Concluir conexão");
    });
    it("estados terminais não expõem CTA de avanço", () => {
      expect(advanceCtaLabel("concluido")).toBeNull();
      expect(advanceCtaLabel("cancelado")).toBeNull();
      expect(isTerminalStatus("concluido")).toBe(true);
      expect(isTerminalStatus("cancelado")).toBe(true);
    });
    it("cobre todos os status conhecidos no mapa centralizado", () => {
      const keys = Object.keys(ADVANCE_CTA_LABEL) as ConnectionStatus[];
      expect(keys.sort()).toEqual(
        [
          "aguardando",
          "apresentados",
          "cancelado",
          "concluido",
          "contato_trocado",
          "em_atendimento",
        ].sort(),
      );
    });
  });

  describe("formatDurationPt (escala pt-BR)", () => {
    it("segundos → 'há poucos segundos'", () => {
      expect(formatDurationPt(0)).toBe("há poucos segundos");
      expect(formatDurationPt(59)).toBe("há poucos segundos");
    });
    it("minutos", () => {
      expect(formatDurationPt(60)).toBe("há 1 min");
      expect(formatDurationPt(4 * 60)).toBe("há 4 min");
      expect(formatDurationPt(59 * 60)).toBe("há 59 min");
    });
    it("horas (até 48h)", () => {
      expect(formatDurationPt(60 * 60)).toBe("há 1 h");
      expect(formatDurationPt(2 * 60 * 60)).toBe("há 2 h");
      expect(formatDurationPt(47 * 60 * 60)).toBe("há 47 h");
    });
    it("dias (a partir de 48h)", () => {
      expect(formatDurationPt(48 * 60 * 60)).toBe("há 2 dias");
      expect(formatDurationPt(3 * 24 * 60 * 60)).toBe("há 3 dias");
    });
    it("nulos/undefined/NaN → '—'", () => {
      expect(formatDurationPt(null)).toBe("—");
      expect(formatDurationPt(undefined)).toBe("—");
      expect(formatDurationPt(Number.NaN)).toBe("—");
    });
    it("short segue mesma escala sem 'há'", () => {
      expect(formatDurationShortPt(30)).toBe("30s");
      expect(formatDurationShortPt(600)).toBe("10 min");
      expect(formatDurationShortPt(60 * 60 * 3)).toBe("3 h");
      expect(formatDurationShortPt(60 * 60 * 24 * 5)).toBe("5 dias");
    });
    it("secondsSince respeita 'now' injetado", () => {
      const now = new Date("2026-01-02T00:00:00Z");
      const then = "2026-01-01T23:00:00Z";
      expect(secondsSince(then, now)).toBe(3600);
      expect(secondsSince(null, now)).toBeNull();
      expect(secondsSince("not-a-date", now)).toBeNull();
    });
  });

  describe("stageStartAt escolhe o timestamp certo por status", () => {
    const base = {
      created_at: "2026-01-01T10:00:00Z",
      assumed_at: "2026-01-01T10:05:00Z",
      presented_at: "2026-01-01T10:20:00Z",
      contact_exchanged_at: "2026-01-01T10:30:00Z",
      completed_at: "2026-01-01T10:45:00Z",
      cancelled_at: null,
    };
    it("aguardando → created_at", () => {
      expect(stageStartAt({ ...base, status: "aguardando" })).toBe(base.created_at);
    });
    it("em_atendimento → assumed_at", () => {
      expect(stageStartAt({ ...base, status: "em_atendimento" })).toBe(base.assumed_at);
    });
    it("apresentados → presented_at", () => {
      expect(stageStartAt({ ...base, status: "apresentados" })).toBe(base.presented_at);
    });
    it("contato_trocado → contact_exchanged_at", () => {
      expect(stageStartAt({ ...base, status: "contato_trocado" })).toBe(
        base.contact_exchanged_at,
      );
    });
    it("concluido → completed_at (fallback consistente)", () => {
      expect(stageStartAt({ ...base, status: "concluido" })).toBe(base.completed_at);
    });
    it("cancelado → cancelled_at ou created_at (fallback)", () => {
      expect(
        stageStartAt({ ...base, status: "cancelado", cancelled_at: "2026-01-01T11:00:00Z" }),
      ).toBe("2026-01-01T11:00:00Z");
      expect(stageStartAt({ ...base, status: "cancelado" })).toBe(base.created_at);
    });
  });

  describe("canAddInternalNote — permissão VISUAL não depende de assigned_to", () => {
    it("admin e staff podem sempre adicionar", () => {
      expect(canAddInternalNote("admin")).toBe(true);
      expect(canAddInternalNote("staff")).toBe(true);
    });
    it("visitante/anon não pode", () => {
      expect(canAddInternalNote(null)).toBe(false);
    });
    it("é decidido apenas pelo role — não recebe assigned_to nem status", () => {
      // Contrato: assinatura é `(role) => boolean`.
      expect(canAddInternalNote.length).toBe(1);
    });
  });

  describe("Reatribuição — filtro exclui o responsável atual", () => {
    const members = [
      { userId: "u1", email: "ana@acirv.com.br", role: "staff" as const, createdAt: "" },
      { userId: "u2", email: "bruno@acirv.com.br", role: "admin" as const, createdAt: "" },
      { userId: "u3", email: "carla@acirv.com.br", role: "staff" as const, createdAt: "" },
    ];
    function eligible(list: typeof members, assignedTo: string | null) {
      return list.filter((m) => m.userId !== assignedTo);
    }
    it("remove o assignee da lista quando existe", () => {
      const out = eligible(members, "u2").map((m) => m.userId);
      expect(out).toEqual(["u1", "u3"]);
    });
    it("mostra todos quando ninguém está atribuído", () => {
      expect(eligible(members, null)).toHaveLength(3);
    });
    it("resulta em lista vazia quando o único membro é o próprio", () => {
      expect(eligible([members[0]], "u1")).toHaveLength(0);
    });
  });

  describe("Observação de reatribuição respeita o limite de 500", () => {
    function validReassignNote(input: string): boolean {
      const t = input.trim();
      return t.length <= 500;
    }
    it("aceita string vazia (opcional)", () => {
      expect(validReassignNote("")).toBe(true);
      expect(validReassignNote("   ")).toBe(true);
    });
    it("aceita até 500 caracteres", () => {
      expect(validReassignNote("a".repeat(500))).toBe(true);
    });
    it("rejeita > 500", () => {
      expect(validReassignNote("a".repeat(501))).toBe(false);
    });
  });

  describe("Reveal — contrato de reset ao fechar/trocar de alvo", () => {
    // Contrato puro: o efeito `reset()` deve ser chamado quando o id do alvo
    // muda (inclusive quando vai para null = fechar). Isso simula o
    // useEffect com dependência `[target?.id]` sem montar React.
    function runResetEffect(prevId: string | null, nextId: string | null) {
      const calls: string[] = [];
      const reset = () => calls.push("reset");
      const setReason = (v: string) => calls.push(`reason:${v}`);
      if (prevId !== nextId) {
        reset();
        setReason("");
      }
      return calls;
    }
    it("chama reset() ao trocar de alvo", () => {
      expect(runResetEffect("m1", "m2")).toEqual(["reset", "reason:"]);
    });
    it("chama reset() ao fechar (id → null)", () => {
      expect(runResetEffect("m1", null)).toEqual(["reset", "reason:"]);
    });
    it("não reseta se o alvo não mudou", () => {
      expect(runResetEffect("m1", "m1")).toEqual([]);
    });
  });
});
