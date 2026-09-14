import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { qk } from "@/features/participant/queryKeys";
import { generateOwnMatchBriefing } from "@/lib/participant-briefing.functions";

/** Erros técnicos traduzidos para a linguagem do participante. */
export function translateParticipantBriefingError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("ai_credits"))
    return "A análise detalhada está temporariamente indisponível. A equipe da ACIRV já foi avisada.";
  if (msg.includes("ai_rate_limited"))
    return "Você gerou várias análises seguidas. Tente novamente em alguns minutos.";
  if (msg.includes("ai_blocked") || msg.includes("ai_unavailable"))
    return "A análise detalhada está indisponível neste momento.";
  if (msg.includes("not_top_three"))
    return "A análise detalhada está disponível apenas para as suas 3 melhores sugestões.";
  if (msg.includes("not_a_participant"))
    return "Esta sugestão não pertence ao seu perfil.";
  if (msg.includes("match_inactive") || msg.includes("match_not_found"))
    return "Esta sugestão não está mais ativa.";
  return "Não foi possível gerar a análise detalhada agora. Tente novamente em instantes.";
}

/** IMPL 31 — gera o briefing oficial e atualiza a lista de sugestões. */
export function useGenerateOwnMatchBriefing(eventId: string) {
  const qc = useQueryClient();
  const run = useServerFn(generateOwnMatchBriefing);
  return useMutation({
    mutationFn: (vars: { matchId: string }) => run({ data: { matchId: vars.matchId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.ownMatches(eventId) });
    },
  });
}
