import type { Decision, MatchKind, MatchLabel } from "@/lib/types";

/** Rótulos visíveis para cada MatchLabel — única fonte de tradução. */
export const LABEL_TEXT: Record<MatchLabel, string> = {
  alta_compatibilidade: "Alta compatibilidade",
  boa_oportunidade: "Boa oportunidade",
  conexao_possivel: "Conexão possível",
};

export const KIND_TEXT: Record<MatchKind, string> = {
  direto: "Direto",
  inverso: "Inverso",
  bidirecional: "Bidirecional",
  complementar: "Complementar",
  hibrido: "Híbrido",
};

export const DECISION_TEXT: Record<Decision, string> = {
  interesse: "Tenho interesse",
  agora_nao: "Agora não",
  sem_decisao: "Sem decisão",
};

/** Verifica interesse mútuo com base em decisões reais (não em connection). */
export function isMutualInterest(
  my: Decision,
  other: Decision,
): boolean {
  return my === "interesse" && other === "interesse";
}
