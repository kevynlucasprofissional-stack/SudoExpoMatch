import { classifyLabel } from "@/domains/matching/score";
import type { Decision, MatchKind, MatchLabel } from "@/lib/types";
import type { OwnMatchDTO } from "@/features/participant/types";

/** Rótulos visíveis para cada MatchLabel — única fonte de tradução. */
export const LABEL_TEXT: Record<MatchLabel, string> = {
  alta_compatibilidade: "Alta compatibilidade",
  boa_oportunidade: "Boa oportunidade",
  conexao_possivel: "Conexão possível",
};

/**
 * Única regra determinística de classificação por score no TS.
 * Espelha `public.match_label_for_score` no banco (thresholds 75 / 40).
 */
export const matchLabelForScore = (score: number): MatchLabel =>
  classifyLabel(Number.isFinite(score) ? score : 0);

/**
 * Classificação exibida ao participante: sempre derivada do próprio score.
 * Usa `label_me` do backend quando presente; senão recalcula (dados antigos).
 * NUNCA usa `match.label` (classificação global interna compartilhada).
 */
export function participantMatchLabel(
  match: Pick<OwnMatchDTO, "score_me"> & { label_me?: MatchLabel | null },
): MatchLabel {
  return match.label_me ?? matchLabelForScore(match.score_me);
}


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
