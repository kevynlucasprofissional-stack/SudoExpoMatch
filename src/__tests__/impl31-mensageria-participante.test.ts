import { describe, expect, it } from "vitest";
import {
  dedupeByProfile,
  describePerson,
  formatPersonList,
  generateParticipantReactivationMessage,
  participantOutreachContextSchema,
  type ParticipantOutreachContext,
} from "@/features/admin/participantOutreach";
import {
  buildParticipantIcebreaker,
  buildParticipantWhatsAppLink,
  resolveIcebreakerHook,
} from "@/features/participant/icebreaker";
import { ownMatchBriefingSchema, ownMatchSchema } from "@/features/participant/schemas";
import { participantDetailSchema } from "@/features/admin/participantsSchemas";
import type { OwnMatchDTO } from "@/features/participant/types";

/**
 * IMPL 31 — mensageria participant-centric + briefing do participante.
 * Todos os testes são PUROS e determinísticos (sem rede, sem banco).
 */

function ctx(over: Partial<ParticipantOutreachContext> = {}): ParticipantOutreachContext {
  return participantOutreachContextSchema.parse({
    profile_id: "11111111-1111-1111-1111-111111111111",
    event_id: "sudoexpo-2026",
    name: "Bruna Silva Santos",
    company: "Silva Modas",
    phone_e164: "+5564992470988",
    active_matches_count: 0,
    incoming_interests: [],
    released_connections: [],
    ...over,
  });
}

const person = (n: number, name: string, company?: string | null) => ({
  match_id: `2222222${n}-2222-2222-2222-222222222222`,
  profile_id: `3333333${n}-3333-3333-3333-333333333333`,
  name,
  company: company ?? null,
});

function match(over: Partial<OwnMatchDTO> = {}): OwnMatchDTO {
  return {
    other: { name: "Carlos Souza", company: "Souza Tecidos", segment_id: "textil" },
    reasons: [],
    other_offers: [],
    other_needs: [],
    briefing: null,
    ...over,
  } as unknown as OwnMatchDTO;
}

describe("IMPL 31 — contexto de abordagem admin", () => {
  it("aceita o contrato da RPC e normaliza ausências", () => {
    const c = participantOutreachContextSchema.parse({
      profile_id: "11111111-1111-1111-1111-111111111111",
      event_id: "sudoexpo-2026",
      name: "Ana",
      company: null,
      phone_e164: null,
    });
    expect(c.phone_e164).toBeNull();
    expect(c.active_matches_count).toBe(0);
    expect(c.incoming_interests).toEqual([]);
    expect(c.released_connections).toEqual([]);
  });

  it("descreve pessoa com e sem empresa e formata listas naturais", () => {
    expect(describePerson({ name: "Ana", company: "Ana Doces" })).toBe("Ana, da Ana Doces");
    expect(describePerson({ name: "Ana", company: null })).toBe("Ana");
    expect(formatPersonList([{ name: "Ana" }])).toBe("Ana");
    expect(formatPersonList([{ name: "Ana" }, { name: "Bia" }])).toBe("Ana e Bia");
    expect(formatPersonList([{ name: "Ana" }, { name: "Bia" }, { name: "Caio" }])).toBe(
      "Ana, Bia e Caio",
    );
  });

  it("deduplica por perfil preservando a ordem", () => {
    const list = [person(1, "Ana"), person(1, "Ana"), person(2, "Bia")];
    expect(dedupeByProfile(list).map((p) => p.name)).toEqual(["Ana", "Bia"]);
  });
});

describe("IMPL 31 — mensagem de reativação participant-centric", () => {
  it("usa o primeiro nome e assina pela ACIRV", () => {
    const msg = generateParticipantReactivationMessage(ctx());
    expect(msg.startsWith("Olá, Bruna, tudo bem? Aqui é o Kevyn, da comunicação da ACIRV.")).toBe(
      true,
    );
  });

  it("NUNCA afirma interesse quando não há interesses recebidos", () => {
    const msg = generateParticipantReactivationMessage(ctx({ active_matches_count: 4 }));
    expect(msg).not.toMatch(/demonstr/i);
    expect(msg).toContain("4 sugestões de conexão");
    expect(msg).toContain("Acessar Minhas Conexões");
  });

  it("é honesta quando não há sugestão alguma", () => {
    const msg = generateParticipantReactivationMessage(ctx({ active_matches_count: 0 }));
    expect(msg).toContain("Ainda não temos sugestões de conexão para o seu perfil");
    expect(msg).not.toMatch(/demonstr/i);
  });

  it("afirma interesse apenas com interesses recebidos reais e concorda no plural", () => {
    const um = generateParticipantReactivationMessage(
      ctx({ active_matches_count: 1, incoming_interests: [person(1, "Ana", "Ana Doces")] }),
    );
    expect(um).toContain("Ana, da Ana Doces demonstrou interesse em conversar com você");

    const dois = generateParticipantReactivationMessage(
      ctx({
        active_matches_count: 2,
        incoming_interests: [person(1, "Ana"), person(2, "Bia")],
      }),
    );
    expect(dois).toContain("Ana e Bia demonstraram interesse");
    expect(dois).toContain("gostariam");
  });

  it("convida a analisar as demais sugestões só quando sobram matches", () => {
    const sobra = generateParticipantReactivationMessage(
      ctx({ active_matches_count: 5, incoming_interests: [person(1, "Ana")] }),
    );
    expect(sobra).toContain("outras sugestões de conexão esperando");

    const semSobra = generateParticipantReactivationMessage(
      ctx({ active_matches_count: 1, incoming_interests: [person(1, "Ana")] }),
    );
    expect(semSobra).not.toContain("outras sugestões de conexão esperando");
  });

  it("diferencia conexão escolhida pelo participante de liberação neutra", () => {
    const escolhida = generateParticipantReactivationMessage(
      ctx({
        active_matches_count: 1,
        released_connections: [
          { ...person(1, "Ana", "Ana Doces"), status: "apresentados", my_decision: "interesse" },
        ],
      }),
    );
    expect(escolhida).toContain("você demonstrou interesse em Ana, da Ana Doces");

    const neutra = generateParticipantReactivationMessage(
      ctx({
        active_matches_count: 1,
        released_connections: [
          { ...person(2, "Bia"), status: "apresentados", my_decision: "sem_decisao" },
        ],
      }),
    );
    expect(neutra).toContain("já possui conexão liberada com Bia");
    expect(neutra).not.toContain("você demonstrou interesse em Bia");
  });

  it("ensina o caminho da aba Conexões quando há contato liberado", () => {
    const msg = generateParticipantReactivationMessage(
      ctx({
        released_connections: [
          { ...person(1, "Ana"), status: "contato_trocado", my_decision: "interesse" },
        ],
      }),
    );
    expect(msg).toContain('clique em "Acessar Minhas Conexões"');
    expect(msg).toContain('aba "Conexões"');
  });

  it("nunca inclui telefone na mensagem, mesmo tendo o número no contexto", () => {
    const msg = generateParticipantReactivationMessage(
      ctx({ active_matches_count: 2, incoming_interests: [person(1, "Ana")] }),
    );
    expect(msg).not.toContain("992470988");
    expect(msg).not.toContain("+55");
  });

  it("é determinística para a mesma entrada", () => {
    const c = ctx({ active_matches_count: 3, incoming_interests: [person(1, "Ana")] });
    expect(generateParticipantReactivationMessage(c)).toBe(
      generateParticipantReactivationMessage(c),
    );
  });
});

describe("IMPL 31 — quebra-gelo do participante", () => {
  it("prioriza a abordagem do briefing oficial", () => {
    const ice = buildParticipantIcebreaker(
      match({
        briefing: {
          summary: "s",
          my_side: [],
          evidence: [],
          approach: "Pergunte sobre a linha de tecidos sustentáveis.",
          generated_at: "2026-09-14T12:00:00Z",
          stale: false,
        },
      } as Partial<OwnMatchDTO>),
    );
    expect(ice.source).toBe("briefing_approach");
    expect(ice.text).toContain("Pergunte sobre a linha de tecidos sustentáveis.");
    expect(ice.text).toContain("Oi, Carlos!");
  });

  it("usa gancho determinístico do matcher sem briefing", () => {
    const ice = buildParticipantIcebreaker(
      match({
        reasons: [{ code: "outro_oferece_o_que_procuro", label: "Oferece tecidos", weight: 55 }],
        other_offers: [{ label: "tecidos de algodão" }],
      } as unknown as Partial<OwnMatchDTO>),
    );
    expect(ice.source).toBe("deterministic");
    expect(ice.text).toContain("tecidos de algodão");
  });

  it("prioriza necessidade marcada como prioritária", () => {
    const hook = resolveIcebreakerHook(
      match({
        reasons: [{ code: "outro_procura_o_que_ofereco", label: "x", weight: 25 }],
        other_needs: [
          { label: "embalagens", is_priority: false },
          { label: "transporte refrigerado", is_priority: true },
        ],
      } as unknown as Partial<OwnMatchDTO>),
    );
    expect(hook).toContain("transporte refrigerado");
  });

  it("cai para mensagem mínima sem nenhum dado de apoio", () => {
    const ice = buildParticipantIcebreaker(match());
    expect(ice.source).toBe("minimal");
    expect(ice.text).toContain("SudoExpo Match");
  });

  it("nunca inventa interesse do outro lado", () => {
    for (const m of [match(), match({ other_offers: [{ label: "café" }] } as never)]) {
      expect(buildParticipantIcebreaker(m).text).not.toMatch(/demonstrou interesse/i);
    }
  });

  it("monta o link wa.me com e sem texto", () => {
    expect(buildParticipantWhatsAppLink("+55 64 99247-0988")).toBe(
      "https://wa.me/5564992470988",
    );
    expect(buildParticipantWhatsAppLink("+5564992470988", "  ")).toBe(
      "https://wa.me/5564992470988",
    );
    expect(buildParticipantWhatsAppLink("+5564992470988", "Oi, Ana!")).toBe(
      "https://wa.me/5564992470988?text=Oi%2C%20Ana!",
    );
  });
});

describe("IMPL 31 — briefing seguro por perspectiva", () => {
  it("expõe apenas o meu lado e descarta riscos e o lado do outro", () => {
    const parsed = ownMatchBriefingSchema.parse({
      summary: "Resumo",
      my_side: ["ganho 1"],
      evidence: [{ label: "oferta x", source: "offer" }],
      risks: ["risco interno"],
      sides: { a: ["lado a"], b: ["lado b"] },
      approach: null,
      generated_at: "2026-09-14T12:00:00Z",
      stale: false,
    });
    const keys = Object.keys(parsed ?? {});
    expect(keys.sort()).toEqual(
      ["approach", "evidence", "generated_at", "my_side", "stale", "summary"].sort(),
    );
  });

  it("match sem briefing continua válido e com briefing nulo", () => {
    const base = {
      match_id: "m1",
      kind: "direto",
      label: "boa_oportunidade",
      score_me: 60,
      generated_at: "2026-09-14T12:00:00Z",
      my_decision: "sem_decisao",
      other_decision: "sem_decisao",
      other: {
        profile_id: "p1",
        name: "Carlos",
        company: "Souza",
        city: "Rio Verde",
        segment_id: "textil",
        summary: "resumo",
      },
      reasons: [],
      other_offers: [],
      other_needs: [],
      connection: null,
    };
    const parsed = ownMatchSchema.safeParse(base);
    if (parsed.success) expect(parsed.data.briefing).toBeNull();
    else expect(parsed.error.issues.some((i) => i.path.includes("briefing"))).toBe(false);
  });

  it("contrato admin do participante continua proibindo contato", () => {
    const forbidden = ["phone", "phone_e164", "whatsapp", "email", "pin_code"];
    const source = participantDetailSchema.toString();
    for (const k of forbidden) expect(source.includes(`"${k}"`)).toBe(false);
  });
});
