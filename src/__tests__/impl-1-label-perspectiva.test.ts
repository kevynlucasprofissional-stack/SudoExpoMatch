import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { classifyLabel } from "@/domains/matching/score";
import { matchLabelForScore, participantMatchLabel } from "@/features/matching/presentation";
import { ownMatchSchema } from "@/features/participant/schemas";
import type { OwnMatchDTO } from "@/features/participant/types";

const base: OwnMatchDTO = {
  match_id: "m1",
  my_profile_id: "p-a",
  other_profile_id: "p-b",
  kind: "bidirecional",
  label: "alta_compatibilidade",
  score_me: 85,
  score_other: 35,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  generated_at: "2026-01-01T00:00:00Z",
  other: {
    name: "N",
    company: "C",
    city: "Viamão",
    neighborhood: null,
    segment_id: "s",
    summary: "x",
  },
  other_offers: [],
  other_needs: [],
  reasons: [],
  my_decision: "sem_decisao",
  other_decision: "sem_decisao",
  connection: null,
};

describe("classificação por perspectiva (score próprio)", () => {
  it("A=85 / B=35 → labels distintas por perspectiva", () => {
    const a = participantMatchLabel({ ...base, score_me: 85, label_me: undefined });
    const b = participantMatchLabel({ ...base, score_me: 35, label_me: undefined });
    expect(a).toBe("alta_compatibilidade");
    expect(b).toBe("conexao_possivel");
    expect(a).not.toBe(b);
  });

  it("scores iguais → mesma label dos dois lados", () => {
    expect(participantMatchLabel({ ...base, score_me: 60 })).toBe(
      participantMatchLabel({ ...base, score_me: 60 }),
    );
    expect(matchLabelForScore(60)).toBe("boa_oportunidade");
  });

  it("alto A / baixo B e baixo A / alto B", () => {
    expect(matchLabelForScore(90)).toBe("alta_compatibilidade");
    expect(matchLabelForScore(10)).toBe("conexao_possivel");
    expect(matchLabelForScore(0)).toBe("conexao_possivel");
    expect(matchLabelForScore(100)).toBe("alta_compatibilidade");
  });

  it("limites exatos e vizinhança dos thresholds (75 / 40)", () => {
    expect(matchLabelForScore(75)).toBe("alta_compatibilidade");
    expect(matchLabelForScore(74)).toBe("boa_oportunidade");
    expect(matchLabelForScore(76)).toBe("alta_compatibilidade");
    expect(matchLabelForScore(40)).toBe("boa_oportunidade");
    expect(matchLabelForScore(39)).toBe("conexao_possivel");
    expect(matchLabelForScore(41)).toBe("boa_oportunidade");
  });

  it("é equivalente ao classifyLabel do matcher em toda a faixa 0..120", () => {
    for (let s = 0; s <= 120; s++) {
      expect(matchLabelForScore(s)).toBe(classifyLabel(s));
    }
  });

  it("usa label_me do backend quando presente e ignora label global", () => {
    expect(participantMatchLabel({ ...base, score_me: 35, label_me: "boa_oportunidade" })).toBe(
      "boa_oportunidade",
    );
    // label global 'alta_compatibilidade' nunca prevalece
    expect(participantMatchLabel({ ...base, score_me: 35 })).toBe("conexao_possivel");
  });

  it("schema aceita payload antigo (sem label_me) e novo (com label_me)", () => {
    expect(ownMatchSchema.safeParse(base).success).toBe(true);
    const parsed = ownMatchSchema.safeParse({
      ...base,
      label_me: "conexao_possivel",
      label_other: "alta_compatibilidade",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.label_me).toBe("conexao_possivel");
    expect(ownMatchSchema.safeParse({ ...base, label_me: "impossivel" }).success).toBe(false);
  });

  it("MatchCard não usa mais match.label na UI", () => {
    const src = readFileSync("src/features/participant/components/MatchCard.tsx", "utf8");
    expect(src).not.toMatch(/match\.label\b/);
    expect(src).toContain("participantMatchLabel(match)");
  });
});
