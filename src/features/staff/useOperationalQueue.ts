import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { ConnectionStatus } from "@/lib/types";

// --------------------------------------------------------------------------
// Schemas Zod para respostas das RPCs v2 (Onda D — hardening).
// Campos nullable espelham o JSON real das RPCs (perfis podem ter cidade
// vazia, segmento pode faltar, e-mail do responsável pode ser nulo).
// --------------------------------------------------------------------------

const statusEnum = z.enum([
  "aguardando",
  "em_atendimento",
  "apresentados",
  "contato_trocado",
  "concluido",
  "cancelado",
]);

// Coerção suave para números vindos do PostgreSQL (int/bigint) que a v2
// devolve como number, mas o driver pode entregar como string em alguns
// caminhos (`extract epoch` em versões antigas).
const nonNegativeInt = z.coerce.number().int().nonnegative();

const queueItemSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  match_id: z.string(),
  status: statusEnum,
  assigned_to: z.string().nullable(),
  assignee_email: z.string().nullable(),
  assigned_at: z.string().nullable(),
  assumed_at: z.string().nullable(),
  presented_at: z.string().nullable(),
  contact_exchanged_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  seconds_in_stage: nonNegativeInt,
  seconds_waiting: nonNegativeInt,
  a_name: z.string(),
  a_company: z.string().nullable().default(""),
  a_city: z.string().nullable().default(""),
  a_segment: z.string().nullable(),
  b_name: z.string(),
  b_company: z.string().nullable().default(""),
  b_city: z.string().nullable().default(""),
  b_segment: z.string().nullable(),
  // Mapa físico da SudoExpo
  mapped_at: z.string().nullable().default(null),
  mapped_by: z.string().nullable().default(null),
  mapped_by_email: z.string().nullable().default(null),
  a_pin_code: z.string().nullable().default(null),
  a_pin_placed_at: z.string().nullable().default(null),
  b_pin_code: z.string().nullable().default(null),
  b_pin_placed_at: z.string().nullable().default(null),
});

const queueResponseSchema = z.object({
  items: z.array(queueItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  counts_by_status: z.record(z.string(), z.number().int().nonnegative()).default({}),
  counts_by_scope: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export type QueueScope =
  | "all"
  | "mine"
  | "unassigned"
  | "pending"
  | "closed"
  | "map_pending"
  | "mapped";
export type QueueSort = "priority" | "waiting" | "updated" | "created";
export const QUEUE_SCOPES: QueueScope[] = [
  "all",
  "mine",
  "unassigned",
  "pending",
  "closed",
  "map_pending",
  "mapped",
];
export const QUEUE_SORTS: QueueSort[] = ["priority", "waiting", "updated", "created"];
export const QUEUE_SORT_LABEL: Record<QueueSort, string> = {
  priority: "Prioridade",
  waiting: "Maior espera",
  updated: "Atualização recente",
  created: "Criação recente",
};

export type QueueItem = z.infer<typeof queueItemSchema>;
export type QueueResponse = z.infer<typeof queueResponseSchema>;

export interface QueueQueryInput {
  eventId: string;
  statuses?: ConnectionStatus[];
  segmentIds?: string[];
  search?: string;
  scope?: QueueScope;
  sort?: QueueSort;
  limit?: number;
  offset?: number;
}

const queueKey = (eventId: string, input: Omit<QueueQueryInput, "eventId">) =>
  ["staff", "queue", eventId, input] as const;

async function fetchQueue(input: QueueQueryInput): Promise<QueueResponse> {
  const { data, error } = await supabase.rpc("staff_list_connections_v2", {
    _event_id: input.eventId,
    _statuses: input.statuses,
    _segment_ids: input.segmentIds,
    _search: input.search,
    _scope: input.scope ?? "all",
    _sort: input.sort ?? "priority",
    _limit: input.limit ?? 25,
    _offset: input.offset ?? 0,
  });
  if (error) throw error;
  return queueResponseSchema.parse(data);
}

/**
 * Fila operacional server-side com:
 *  - polling fallback de 20s (garante progresso mesmo sem Realtime);
 *  - uma única subscription de Realtime por eventId, com filtro por event_id
 *    (postgres_changes filter) e validação do payload antes de invalidar.
 */
export function useOperationalQueue(input: QueueQueryInput, enabled: boolean) {
  const qc = useQueryClient();
  const { eventId, ...rest } = input;
  const key = queueKey(eventId, rest);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchQueue(input),
    enabled,
    staleTime: 5_000,
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!enabled) return;
    const channelName = `staff-queue-v2-${eventId}`;
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { event_id?: string } | null;
          if (row && row.event_id && row.event_id !== eventId) return;
          qc.invalidateQueries({ queryKey: ["staff", "queue", eventId] });
          qc.invalidateQueries({ queryKey: ["staff", "op-stats", eventId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, enabled, qc]);

  return query;
}

// --------------------------------------------------------------------------
// Detalhe da conexão
// --------------------------------------------------------------------------

const detailSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  match_id: z.string(),
  status: statusEnum,
  assigned_to: z.string().nullable(),
  assignee_email: z.string().nullable(),
  assigned_at: z.string().nullable(),
  assumed_at: z.string().nullable(),
  presented_at: z.string().nullable(),
  contact_exchanged_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  notes_summary: z.string().nullable(),
  mapped_at: z.string().nullable().default(null),
  mapped_by: z.string().nullable().default(null),
  mapped_by_email: z.string().nullable().default(null),
  a: z.object({
    id: z.string(),
    name: z.string(),
    company: z.string().nullable().default(""),
    city: z.string().nullable().default(""),
    segment_id: z.string().nullable(),
    summary: z.string().nullable().default(""),
    pin_code: z.string().nullable().default(null),
    pin_placed_at: z.string().nullable().default(null),
  }),
  b: z.object({
    id: z.string(),
    name: z.string(),
    company: z.string().nullable().default(""),
    city: z.string().nullable().default(""),
    segment_id: z.string().nullable(),
    summary: z.string().nullable().default(""),
    pin_code: z.string().nullable().default(null),
    pin_placed_at: z.string().nullable().default(null),
  }),
  reasons: z.array(
    z.object({
      code: z.string(),
      label: z.string().nullable(),
      weight: z.number().int(),
      perspective_profile_id: z.string().nullable().optional(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      previous_status: statusEnum.nullable(),
      new_status: statusEnum.nullable(),
      assigned_from: z.string().nullable(),
      assigned_to: z.string().nullable(),
      note: z.string().nullable(),
      metadata: z.unknown(),
      created_at: z.string(),
      actor_email: z.string().nullable(),
    }),
  ),
  internal_notes: z.array(
    z.object({
      id: z.string(),
      body: z.string(),
      created_at: z.string(),
      author_email: z.string().nullable(),
    }),
  ),
});

export type ConnectionDetail = z.infer<typeof detailSchema>;

export function useConnectionDetail(connectionId: string | null) {
  return useQuery({
    queryKey: ["staff", "connection-detail", connectionId ?? "none"],
    enabled: !!connectionId,
    staleTime: 2_000,
    queryFn: async (): Promise<ConnectionDetail> => {
      const { data, error } = await supabase.rpc("staff_list_connection_detail", {
        _connection_id: connectionId!,
      });
      if (error) throw error;
      return detailSchema.parse(data);
    },
  });
}

// --------------------------------------------------------------------------
// Mutations operacionais
// --------------------------------------------------------------------------

function invalidateOps(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: ["staff", "queue", eventId] });
  qc.invalidateQueries({ queryKey: ["staff", "op-stats", eventId] });
  qc.invalidateQueries({ queryKey: ["stats", eventId] });
}

export function useAssumeConnection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase.rpc("staff_assume_connection", {
        _connection_id: connectionId,
      });
      if (error) throw error;
    },
    onSuccess: (_, connectionId) => {
      invalidateOps(qc, eventId);
      qc.invalidateQueries({
        queryKey: ["staff", "connection-detail", connectionId],
      });
    },
  });
}

export function useReleaseConnection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string; note?: string }) => {
      const { error } = await supabase.rpc("staff_release_connection", {
        _connection_id: input.connectionId,
        _note: input.note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      invalidateOps(qc, eventId);
      qc.invalidateQueries({
        queryKey: ["staff", "connection-detail", input.connectionId],
      });
    },
  });
}

export function useReassignConnection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string; newUserId: string; note?: string }) => {
      const { error } = await supabase.rpc("admin_reassign_connection", {
        _connection_id: input.connectionId,
        _new_user_id: input.newUserId,
        _note: input.note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      invalidateOps(qc, eventId);
      qc.invalidateQueries({
        queryKey: ["staff", "connection-detail", input.connectionId],
      });
    },
  });
}

export function useAddConnectionNote(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string; body: string }) => {
      const { data, error } = await supabase.rpc("staff_add_connection_note", {
        _connection_id: input.connectionId,
        _body: input.body,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_, input) => {
      invalidateOps(qc, eventId);
      qc.invalidateQueries({
        queryKey: ["staff", "connection-detail", input.connectionId],
      });
    },
  });
}
