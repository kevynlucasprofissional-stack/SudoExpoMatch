import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

/**
 * IMPL 9 — estado de URL da rota /admin/participantes.
 * Segue o mesmo padrão de /equipe: `fallback` para nunca lançar em URL
 * inválida e sanitização estrita para bater com o que a RPC aceita.
 */
export const PARTICIPANTS_PAGE_SIZE = 20;
/** Teto defensivo espelhando o clamp da RPC. */
export const PARTICIPANTS_MAX_LIMIT = 100;

export const participantesSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  segments: fallback(z.string(), "").default(""),
  city: fallback(z.string(), "").default(""),
  page: fallback(z.coerce.number().int(), 1).default(1),
  p: fallback(z.string(), "").default(""),
});

export type ParticipantesSearch = z.infer<typeof participantesSearchSchema>;

export interface NormalizedParticipantesSearch {
  q: string;
  segments: string[];
  city: string;
  page: number;
  /** id do participante aberto no detalhe (query state, compartilhável) */
  selected: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeParticipantesSearch(
  s: Partial<ParticipantesSearch>,
): NormalizedParticipantesSearch {
  const q = (s.q ?? "").toString().trim().slice(0, 120);
  const city = (s.city ?? "").toString().trim().slice(0, 80);
  const segments = (s.segments ?? "")
    .toString()
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, 25);
  const rawPage = Number(s.page);
  const page = Math.max(
    1,
    Math.min(9999, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1),
  );
  const raw = (s.p ?? "").toString();
  const selected = UUID_RE.test(raw) ? raw : null;
  return { q, segments, city, page, selected };
}

export function segmentsToParam(ids: string[]): string {
  return ids.filter(Boolean).join(",");
}

export function pageToOffset(page: number, pageSize = PARTICIPANTS_PAGE_SIZE) {
  return Math.max(0, (page - 1) * pageSize);
}

export function totalPages(total: number, pageSize = PARTICIPANTS_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}
