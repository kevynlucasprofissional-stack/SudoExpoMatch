import { describe, expect, it } from "vitest";
import {
  isHighSynergyMatch,
  sortMatchesByMutualInterest,
} from "@/features/participant/presentation";
import { generateMatchAiSummary } from "@/features/participant/matchAiSummary";
import type { OwnMatchDTO } from "@/features/participant/types";

function makeMatch(partial: Partial<OwnMatchDTO> & { match_id: string; score_me: number; score_other: number }): OwnMatchDTO {
  return {
    kind: "direto",
    label: "alta_compatibilidade",
    my_profile_id: "me-id",
    other_profile_id: "other-id",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    generated_at: new Date().toISOString(),
    other: {
      name: "Carlos Silva",
      company: "Tech Agro Soluções",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: "agronegocio",
      summary: "Desenvolvemos softwares e automações para fazendas e armazéns de grãos.",
    },
    other_offers: [
      { label: "Software de Gestão Agrícola", detail: "ERP para fazendas" },
      { label: "Consultoria em Automação", detail: null },
    ],
    other_needs: [
      { label: "Contabilidade Rural", detail: "Planejamento tributário", need_kind: "servico", is_priority: true },
      { label: "Parceiro Comercial", detail: "Canais de venda", need_kind: "parceiro", is_priority: false },
    ],
    reasons: [
      { code: "outro_oferece_o_que_procuro", label: "Ela oferece o que você procura: Software de Gestão Agrícola", weight: 55 },
      { code: "outro_procura_o_que_ofereco", label: "Ela procura o que você oferece: Contabilidade Rural", weight: 25 },
      { code: "prioridade", label: "Atende necessidade prioritária", weight: 10 },
      { code: "proximidade", label: "Mesma cidade: Rio Verde", weight: 2 },
    ],
    my_decision: "sem_decisao",
    other_decision: "sem_decisao",
    connection: null,
    ...partial,
  };
}

describe("Ordenação de Matches (Prioridade para Alta Sinergia Mútua)", () => {
  it("identifica corretamente matches de alta sinergia (ambos >= 60 e assimetria < 30)", () => {
    expect(isHighSynergyMatch(makeMatch({ match_id: "1", score_me: 75, score_other: 70 }))).toBe(true);
    expect(isHighSynergyMatch(makeMatch({ match_id: "2", score_me: 60, score_other: 60 }))).toBe(true);
    expect(isHighSynergyMatch(makeMatch({ match_id: "3", score_me: 90, score_other: 61 }))).toBe(true); // gap 29 < 30

    // Casos que não atendem:
    expect(isHighSynergyMatch(makeMatch({ match_id: "4", score_me: 100, score_other: 65 }))).toBe(false); // gap 35 >= 30
    expect(isHighSynergyMatch(makeMatch({ match_id: "5", score_me: 95, score_other: 55 }))).toBe(false); // other < 60
    expect(isHighSynergyMatch(makeMatch({ match_id: "6", score_me: 50, score_other: 80 }))).toBe(false); // me < 60
  });

  it("posiciona no topo matches com ambos >= 60 e menor assimetria primeiro", () => {
    const mEquilibradoMenorAssimetria = makeMatch({
      match_id: "m-gap-5",
      score_me: 80,
      score_other: 75, // gap = 5 (ambos >= 60) -> TIER 1
    });

    const mEquilibradoMaiorAssimetria = makeMatch({
      match_id: "m-gap-20",
      score_me: 90,
      score_other: 70, // gap = 20 (ambos >= 60) -> TIER 1
    });

    const mMutualMasAssimetriaAlta = makeMatch({
      match_id: "m-gap-40",
      score_me: 110,
      score_other: 70, // gap = 40 (ambos >= 60, mas assimetria >= 30) -> TIER 2
    });

    const mAssimetricoUmBaixo = makeMatch({
      match_id: "m-um-baixo",
      score_me: 95,
      score_other: 35, // gap = 60, outro < 60 -> TIER 3
    });

    const mScoresBaixos = makeMatch({
      match_id: "m-baixo",
      score_me: 45,
      score_other: 40, // ambos < 60 -> TIER 3
    });

    // Lista desordenada propositalmente
    const lista = [
      mScoresBaixos,
      mAssimetricoUmBaixo,
      mMutualMasAssimetriaAlta,
      mEquilibradoMaiorAssimetria,
      mEquilibradoMenorAssimetria,
    ];

    const ordenada = sortMatchesByMutualInterest(lista);

    // 1º lugar: Tier 1 com menor assimetria (gap 5)
    expect(ordenada[0].match_id).toBe("m-gap-5");
    // 2º lugar: Tier 1 com assimetria 20
    expect(ordenada[1].match_id).toBe("m-gap-20");
    // 3º lugar: Tier 2 (ambos >= 60, mas assimetria >= 30)
    expect(ordenada[2].match_id).toBe("m-gap-40");
    // 4º lugar: Tier 3 (score_me alto mas sem reciprocidade >= 60)
    expect(ordenada[3].match_id).toBe("m-um-baixo");
    // 5º lugar: Tier 3 com menor score
    expect(ordenada[4].match_id).toBe("m-baixo");
  });

  it("desempata matches de mesmo tier pela soma dos scores", () => {
    const m1 = makeMatch({ match_id: "m1", score_me: 70, score_other: 70 }); // gap 0, soma 140
    const m2 = makeMatch({ match_id: "m2", score_me: 85, score_other: 85 }); // gap 0, soma 170

    const ordenada = sortMatchesByMutualInterest([m1, m2]);
    expect(ordenada[0].match_id).toBe("m2");
    expect(ordenada[1].match_id).toBe("m1");
  });

  it("envia matches marcados como 'agora_nao' para o final da fila, mantendo os em aberto no topo", () => {
    // Match de alta sinergia, mas marcado como agora_nao
    const mHighDismissed = makeMatch({
      match_id: "m-high-dismissed",
      score_me: 90,
      score_other: 90,
      my_decision: "agora_nao",
    });

    // Match modesto, mas em aberto (sem_decisao)
    const mLowOpen = makeMatch({
      match_id: "m-low-open",
      score_me: 40,
      score_other: 40,
      my_decision: "sem_decisao",
    });

    // Match de alta sinergia em aberto
    const mHighOpen = makeMatch({
      match_id: "m-high-open",
      score_me: 85,
      score_other: 85,
      my_decision: "sem_decisao",
    });

    const ordenada = sortMatchesByMutualInterest([mHighDismissed, mLowOpen, mHighOpen]);

    // Topo da lista: apenas matches em aberto / ativos
    expect(ordenada[0].match_id).toBe("m-high-open");
    expect(ordenada[1].match_id).toBe("m-low-open");

    // Final da fila: match marcado como 'agora_nao'
    expect(ordenada[2].match_id).toBe("m-high-dismissed");
  });
});

describe("Resumo de IA nos Cartões de Match", () => {
  it("gera respostas claras e contextuais para as duas perguntas solicitadas", () => {
    const match = makeMatch({
      match_id: "match-ia-test",
      score_me: 85,
      score_other: 80,
    });

    const summary = generateMatchAiSummary(match);

    expect(summary).toHaveProperty("why_connect");
    expect(summary).toHaveProperty("what_you_gain");

    // Ponto 1: Por qual motivo se conectar
    expect(summary.why_connect.length).toBeGreaterThan(30);
    expect(summary.why_connect).toMatch(/Tech Agro Soluções|Software de Gestão Agrícola|Contabilidade Rural/);

    // Ponto 2: O que você ganha se conectando
    expect(summary.what_you_gain.length).toBeGreaterThan(30);
    expect(summary.what_you_gain).toMatch(/vantagem|oportunidade|atende|ganha|solução|negócio/i);
  });

  it("gera resumo elegante mesmo quando há poucos dados cadastrados", () => {
    const matchSimples = makeMatch({
      match_id: "match-simples",
      score_me: 65,
      score_other: 62,
      other: {
        name: "Mariana Costa",
        company: "Studio Design",
        city: "Rio Verde",
        neighborhood: null,
        segment_id: "servicos",
        summary: "",
      },
      other_offers: [],
      other_needs: [],
      reasons: [],
    });

    const summary = generateMatchAiSummary(matchSimples);
    expect(summary.why_connect.length).toBeGreaterThan(20);
    expect(summary.what_you_gain.length).toBeGreaterThan(20);
    expect(summary.why_connect).toContain("Studio Design");
  });
});
