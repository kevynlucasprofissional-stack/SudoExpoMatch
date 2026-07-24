import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import {
  QUEUE_SCOPES,
  QUEUE_SORTS,
  type QueueScope,
  type QueueSort,
} from "@/features/staff/useOperationalQueue";
import type { ConnectionStatus } from "@/lib/types";

const CONNECTION_STATUSES: ConnectionStatus[] = [
  "aguardando",
  "em_atendimento",
  "apresentados",
  "contato_trocado",
  "concluido",
  "cancelado",
];

/**
 * Schema de search params da rota /equipe.
 *
 * Regras:
 *  - Usa `fallback` do adaptador do TanStack Router para nunca lançar em URLs
 *    inválidas (?scope=xpto vira default).
 *  - Sanitização estrita (allowlist) é feita nos helpers abaixo para bater
 *    exatamente com o que a RPC aceita.
 *  - `segments` é serializado como string única com ids separados por vírgula
 *    para manter a URL curta e compartilhável.
 *  - `page` é 1-based na URL para ficar humano; o hook converte para offset.
 */
export const equipeSearchSchema = z.object({
  scope: fallback(z.string(), "pending").default("pending"),
  status: fallback(z.string(), "all").default("all"),
  sort: fallback(z.string(), "priority").default("priority"),
  q: fallback(z.string(), "").default(""),
  segments: fallback(z.string(), "").default(""),
  page: fallback(z.coerce.number().int(), 1).default(1),
});

export type EquipeSearch = z.infer<typeof equipeSearchSchema>;

export interface NormalizedEquipeSearch {
  scope: QueueScope;
  status: ConnectionStatus | "all";
  sort: QueueSort;
  q: string;
  segments: string[];
  page: number;
}

export function normalizeEquipeSearch(s: EquipeSearch): NormalizedEquipeSearch {
  const scope = (QUEUE_SCOPES as string[]).includes(s.scope)
    ? (s.scope as QueueScope)
    : "pending";
  const sort = (QUEUE_SORTS as string[]).includes(s.sort)
    ? (s.sort as QueueSort)
    : "priority";
  const status =
    s.status === "all" || (CONNECTION_STATUSES as string[]).includes(s.status)
      ? (s.status as ConnectionStatus | "all")
      : "all";
  const q = (s.q ?? "").toString().slice(0, 200);
  const segments = (s.segments ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 25);
  const page = Math.max(
    1,
    Math.min(9999, Number.isFinite(s.page) ? Math.trunc(s.page) : 1),
  );
  return { scope, status, sort, q, segments, page };
}

export function segmentsToParam(ids: string[]): string {
  return ids.filter(Boolean).join(",");
}
