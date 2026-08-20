/**
 * Resultados comerciais (outcomes) das conexões.
 *
 * Decisão de modelagem: NÃO criamos entidade nova. `connection_events` já
 * possui event_id, connection_id, actor_user_id, action, note, metadata e
 * created_at — exatamente o que o outcome exige (tipo, timestamp, ator,
 * observação curta). A unicidade por tipo é garantida por índice único
 * parcial em (connection_id, action) WHERE action LIKE 'outcome:%', e as
 * consultas agregadas usam índice parcial em (event_id, action, created_at).
 * O status operacional (`connections.status`) permanece intocado.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const OUTCOME_KINDS = [
  "conversa_realizada",
  "reuniao_agendada",
  "proposta_solicitada",
  "negocio_reportado",
] as const;

export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  conversa_realizada: "Conversa realizada",
  reuniao_agendada: "Reunião agendada",
  proposta_solicitada: "Proposta solicitada",
  negocio_reportado: "Negócio reportado",
};

export const OUTCOME_NOTE_MAX = 280;

export function isOutcomeKind(kind: string): kind is OutcomeKind {
  return (OUTCOME_KINDS as readonly string[]).includes(kind);
}

export const outcomeSchema = z.object({
  kind: z.enum(OUTCOME_KINDS),
  note: z.string().nullable().default(null),
  created_at: z.string(),
  actor_email: z.string().nullable().default(null),
});

export const outcomeListSchema = z.array(outcomeSchema).default([]);

export type ConnectionOutcome = z.infer<typeof outcomeSchema>;

const mutationResultSchema = z.object({
  connection_id: z.string(),
  kind: z.enum(OUTCOME_KINDS),
  created: z.boolean().optional(),
  removed: z.boolean().optional(),
  outcomes: outcomeListSchema,
});

export function translateOutcomeError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (message.includes("invalid_outcome_kind")) return "Tipo de resultado inválido.";
  if (message.includes("note_too_long"))
    return `Observação muito longa (máx. ${OUTCOME_NOTE_MAX} caracteres).`;
  if (message.includes("connection_not_found")) return "Conexão não encontrada.";
  if (message.includes("forbidden")) return "Você não tem permissão nesta operação.";
  if (message.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  return "Não foi possível registrar o resultado.";
}

function invalidate(qc: ReturnType<typeof useQueryClient>, eventId: string, connectionId: string) {
  qc.invalidateQueries({ queryKey: ["staff", "connection-detail", connectionId] });
  qc.invalidateQueries({ queryKey: ["staff", "queue", eventId] });
  qc.invalidateQueries({ queryKey: ["admin", "experience-analytics", eventId] });
}

export function useRecordConnectionOutcome(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string; kind: OutcomeKind; note?: string }) => {
      const { data, error } = await supabase.rpc("staff_record_connection_outcome", {
        _connection_id: input.connectionId,
        _kind: input.kind,
        _note: input.note?.trim() ? input.note.trim() : undefined,
      });
      if (error) throw error;
      return mutationResultSchema.parse(data);
    },
    onSuccess: (_, input) => invalidate(qc, eventId, input.connectionId),
  });
}

export function useRemoveConnectionOutcome(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string; kind: OutcomeKind }) => {
      const { data, error } = await supabase.rpc("staff_remove_connection_outcome", {
        _connection_id: input.connectionId,
        _kind: input.kind,
      });
      if (error) throw error;
      return mutationResultSchema.parse(data);
    },
    onSuccess: (_, input) => invalidate(qc, eventId, input.connectionId),
  });
}
