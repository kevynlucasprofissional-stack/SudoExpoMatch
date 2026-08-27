import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateMatchBriefing } from "@/lib/match-briefing.functions";

/** Mensagens de erro do gateway traduzidas para a equipe. */
export function translateBriefingError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("ai_credits"))
    return "Créditos de IA esgotados. Peça ao responsável para recarregar.";
  if (msg.includes("ai_blocked")) return "A IA está bloqueada nas configurações do projeto.";
  if (msg.includes("ai_rate_limited")) return "Muitas gerações seguidas. Tente de novo em instantes.";
  if (msg.includes("ai_unavailable")) return "IA não configurada neste ambiente.";
  if (msg.includes("forbidden")) return "Acesso negado: apenas a equipe deste evento.";
  if (msg.includes("not_found")) return "Match não encontrado.";
  return "Não foi possível gerar a leitura comercial agora.";
}

export function useGenerateMatchBriefing(eventId: string) {
  const qc = useQueryClient();
  const run = useServerFn(generateMatchBriefing);
  return useMutation({
    mutationFn: (vars: { matchId: string }) => run({ data: { matchId: vars.matchId } }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "match-detail", vars.matchId] });
      qc.invalidateQueries({ queryKey: ["admin", "matches", eventId] });
    },
  });
}
