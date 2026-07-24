import { describe, expect, it } from "vitest";
import {
  canAddInternalNote,
  eligibleReassignees,
  formatElapsedSeconds,
  getOperationalCta,
  OPERATIONAL_CTA_LABEL,
  shouldResetReveal,
} from "@/features/staff/operationalUi";
import { optionalStaffNoteSchema } from "@/features/staff/schemas";
import type { ConnectionStatus } from "@/lib/types";

describe("Onda D — acabamento residual (operationalUi)", () => {
  describe("getOperationalCta — rótulos exatos", () => {
    it("aguardando → 'Assumir atendimento'", () => {
      expect(getOperationalCta("aguardando")).toBe("Assumir atendimento");
    });
    it("em_atendimento → 'Marcar como apresentados'", () => {
      expect(getOperationalCta("em_atendimento")).toBe(
        "Marcar como apresentados",
      );
    });
    it("apresentados → 'Registrar troca de contato'", () => {
      expect(getOperationalCta("apresentados")).toBe(
        "Registrar troca de contato",
      );
    });
    it("contato_trocado → 'Concluir conexão'", () => {
      expect(getOperationalCta("contato_trocado")).toBe("Concluir conexão");
    });
    it("estados terminais → null", () => {
      expect(getOperationalCta("concluido")).toBeNull();
      expect(getOperationalCta("cancelado")).toBeNull();
    });
    it("cobre todos os status conhecidos", () => {
      const keys = Object.keys(OPERATIONAL_CTA_LABEL) as ConnectionStatus[];
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

  describe("formatElapsedSeconds — escala pt-BR com prefixo 'há'", () => {
    it("segundos", () => {
      expect(formatElapsedSeconds(0)).toBe("há 1 segundo");
      expect(formatElapsedSeconds(1)).toBe("há 1 segundo");
      expect(formatElapsedSeconds(2)).toBe("há 2 segundos");
      expect(formatElapsedSeconds(59)).toBe("há 59 segundos");
    });
    it("minutos", () => {
      expect(formatElapsedSeconds(60)).toBe("há 1 minuto");
      expect(formatElapsedSeconds(120)).toBe("há 2 minutos");
      expect(formatElapsedSeconds(59 * 60)).toBe("há 59 minutos");
    });
    it("horas (até 48h)", () => {
      expect(formatElapsedSeconds(60 * 60)).toBe("há 1 hora");
      expect(formatElapsedSeconds(3 * 60 * 60)).toBe("há 3 horas");
      expect(formatElapsedSeconds(47 * 60 * 60)).toBe("há 47 horas");
    });
    it("dias (a partir de 48h)", () => {
      expect(formatElapsedSeconds(48 * 60 * 60)).toBe("há 2 dias");
      expect(formatElapsedSeconds(3 * 24 * 60 * 60)).toBe("há 3 dias");
    });
    it("nulos/inválidos → '—'", () => {
      expect(formatElapsedSeconds(null)).toBe("—");
      expect(formatElapsedSeconds(undefined)).toBe("—");
      expect(formatElapsedSeconds(Number.NaN)).toBe("—");
      expect(formatElapsedSeconds(-5)).toBe("—");
    });
  });

  describe("canAddInternalNote — não depende de assignee", () => {
    it("é sempre true para membros já autorizados pela camada de rota", () => {
      expect(canAddInternalNote()).toBe(true);
    });
    it("assinatura pura sem argumentos", () => {
      expect(canAddInternalNote.length).toBe(0);
    });
  });

  describe("eligibleReassignees — exclui o responsável atual", () => {
    const members = [
      { userId: "u1", email: "ana@acirv.com.br", role: "staff" as const },
      { userId: "u2", email: "bruno@acirv.com.br", role: "admin" as const },
      { userId: "u3", email: "carla@acirv.com.br", role: "staff" as const },
    ];
    it("remove o assignee da lista quando existe", () => {
      const out = eligibleReassignees(members, "u2").map((m) => m.userId);
      expect(out).toEqual(["u1", "u3"]);
    });
    it("preserva a ordem original", () => {
      const out = eligibleReassignees(members, "u3").map((m) => m.userId);
      expect(out).toEqual(["u1", "u2"]);
    });
    it("retorna todos quando assignee é null ou undefined", () => {
      expect(eligibleReassignees(members, null)).toHaveLength(3);
      expect(eligibleReassignees(members, undefined)).toHaveLength(3);
    });
    it("retorna lista vazia quando único membro é o próprio", () => {
      expect(eligibleReassignees([members[0]], "u1")).toHaveLength(0);
    });
    it("não muta o array original", () => {
      const copy = [...members];
      eligibleReassignees(members, "u2");
      expect(members).toEqual(copy);
    });
  });

  describe("optionalStaffNoteSchema — observação de reatribuição (opcional, ≤500)", () => {
    it("aceita vazio/whitespace como undefined", () => {
      const a = optionalStaffNoteSchema.safeParse("");
      const b = optionalStaffNoteSchema.safeParse("   ");
      const c = optionalStaffNoteSchema.safeParse(undefined);
      expect(a.success && a.data === undefined).toBe(true);
      expect(b.success && b.data === undefined).toBe(true);
      expect(c.success && c.data === undefined).toBe(true);
    });
    it("aceita até 500 caracteres", () => {
      const r = optionalStaffNoteSchema.safeParse("a".repeat(500));
      expect(r.success).toBe(true);
    });
    it("rejeita > 500 caracteres", () => {
      const r = optionalStaffNoteSchema.safeParse("a".repeat(501));
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0]?.message).toMatch(/500/);
      }
    });
    it("faz trim antes de validar tamanho", () => {
      const r = optionalStaffNoteSchema.safeParse(
        "   " + "a".repeat(500) + "   ",
      );
      expect(r.success).toBe(true);
      if (r.success) expect(r.data).toBe("a".repeat(500));
    });
  });

  describe("shouldResetReveal — contrato do diálogo de revelação", () => {
    it("dispara reset ao trocar de target", () => {
      expect(shouldResetReveal("m1", "m2")).toBe(true);
    });
    it("dispara reset ao fechar (id → null)", () => {
      expect(shouldResetReveal("m1", null)).toBe(true);
    });
    it("dispara reset ao abrir (null → id)", () => {
      expect(shouldResetReveal(null, "m1")).toBe(true);
    });
    it("não reseta se o target não mudou", () => {
      expect(shouldResetReveal("m1", "m1")).toBe(false);
      expect(shouldResetReveal(null, null)).toBe(false);
      expect(shouldResetReveal(undefined, null)).toBe(false);
    });
  });
});
