import { z } from "zod";

/**
 * Contratos da RPC `admin_match_graph` (Mapa de conexões).
 *
 * Regras que o shape carrega:
 * - payload magro e completo (sem paginação): nós + arestas + totais;
 * - `interest_state` é derivado de `match_decisions` no SQL, nunca da coluna
 *   legada `matches.label`;
 * - nenhum dado de contato trafega (validado por `hasPrivateKey` nos testes).
 */

const int = z.coerce.number().int();

export const INTEREST_STATES = ["mutual", "single", "none", "declined"] as const;
export type InterestState = (typeof INTEREST_STATES)[number];

export const graphNodeSchema = z.object({
  profile_id: z.string().uuid(),
  name: z.string(),
  company: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  segment_id: z.string().nullable(),
  segment_label: z.string().nullable(),
  degree: int,
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  match_id: z.string().uuid(),
  a_profile_id: z.string().uuid(),
  b_profile_id: z.string().uuid(),
  score_for_a: int,
  score_for_b: int,
  kind: z.string(),
  decision_a: z.string(),
  decision_b: z.string(),
  interest_state: z.enum(INTEREST_STATES),
  connection_status: z.string().nullable(),
  reviewed: z.boolean().default(false),
  has_briefing: z.boolean().default(false),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphMetaSchema = z.object({
  nodes_total: int,
  edges_total: int,
  mutual: int,
  single: int,
  none: int,
  declined: int,
});
export type GraphMeta = z.infer<typeof graphMetaSchema>;

export const matchGraphSchema = z.object({
  event_id: z.string(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  meta: graphMetaSchema,
});
export type MatchGraph = z.infer<typeof matchGraphSchema>;

export function translateAdminGraphError(message: string | undefined): string {
  if (!message) return "Não foi possível carregar o mapa de conexões.";
  if (message.includes("forbidden")) return "Você não tem permissão neste evento.";
  if (message.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  return "Não foi possível carregar o mapa de conexões.";
}
