import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

/**
 * IMPL 10 — estado de URL de /admin/matches.
 * Tudo que filtra vive na URL (auditoria compartilhável) e é sanitizado aqui
 * com o mesmo vocabulário aceito pela RPC.
 */
export const MATCHES_PAGE_SIZE = 20;
export const MATCHES_MAX_LIMIT = 100;

export const MATCH_KINDS = [
  "direto",
  "inverso",
  "bidirecional",
  "complementar",
  "hibrido",
] as const;
export const MATCH_LABELS = [
  "alta_compatibilidade",
  "boa_oportunidade",
  "conexao_possivel",
] as const;
export const DECISIONS = ["interesse", "agora_nao", "sem_decisao"] as const;
export const CONNECTION_STATUSES = [
  "aguardando",
  "em_atendimento",
  "apresentados",
  "contato_trocado",
  "concluido",
  "cancelado",
] as const;
/** Perspectiva a que faixa de score e classificação se aplicam. */
export const SCORE_SIDES = ["any", "a", "b", "both"] as const;
export const CONNECTION_MODES = ["any", "with", "without"] as const;
export const SORTS = ["score_desc", "score_asc", "gap_desc", "recent"] as const;

export const SCORE_SIDE_TEXT: Record<(typeof SCORE_SIDES)[number], string> = {
  any: "Qualquer lado",
  a: "Somente lado A",
  b: "Somente lado B",
  both: "Os dois lados",
};
export const SORT_TEXT: Record<(typeof SORTS)[number], string> = {
  score_desc: "Maior score",
  score_asc: "Menor score",
  gap_desc: "Maior assimetria",
  recent: "Mais recentes",
};
export const CONNECTION_MODE_TEXT: Record<(typeof CONNECTION_MODES)[number], string> = {
  any: "Tanto faz",
  with: "Com conexão",
  without: "Sem conexão",
};

export const matchesSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  kind: fallback(z.string(), "").default(""),
  label: fallback(z.string(), "").default(""),
  side: fallback(z.string(), "any").default("any"),
  min: fallback(z.string(), "").default(""),
  max: fallback(z.string(), "").default(""),
  seg: fallback(z.string(), "").default(""),
  dec: fallback(z.string(), "").default(""),
  mutual: fallback(z.string(), "").default(""),
  conn: fallback(z.string(), "any").default("any"),
  cstatus: fallback(z.string(), "").default(""),
  ver: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "score_desc").default("score_desc"),
  page: fallback(z.coerce.number().int(), 1).default(1),
  m: fallback(z.string(), "").default(""),
});
export type MatchesSearch = z.infer<typeof matchesSearchSchema>;

export interface NormalizedMatchesSearch {
  q: string;
  kinds: string[];
  labels: string[];
  side: (typeof SCORE_SIDES)[number];
  min: number | null;
  max: number | null;
  segments: string[];
  decisions: string[];
  mutual: boolean;
  connection: (typeof CONNECTION_MODES)[number];
  connectionStatuses: string[];
  versions: string[];
  sort: (typeof SORTS)[number];
  page: number;
  /** match aberto no detalhe (estado de URL, compartilhável) */
  selected: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(raw: unknown, allowed?: readonly string[], max = 20): string[] {
  return (raw ?? "")
    .toString()
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && (!allowed || allowed.includes(x)))
    .slice(0, max);
}

function score(raw: unknown): number | null {
  const s = (raw ?? "").toString().trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.trunc(n)));
}

export function normalizeMatchesSearch(s: Partial<MatchesSearch>): NormalizedMatchesSearch {
  const side = SCORE_SIDES.includes((s.side ?? "") as never)
    ? (s.side as (typeof SCORE_SIDES)[number])
    : "any";
  const connection = CONNECTION_MODES.includes((s.conn ?? "") as never)
    ? (s.conn as (typeof CONNECTION_MODES)[number])
    : "any";
  const sort = SORTS.includes((s.sort ?? "") as never)
    ? (s.sort as (typeof SORTS)[number])
    : "score_desc";
  const rawPage = Number(s.page);
  const page = Math.max(1, Math.min(9999, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1));
  const raw = (s.m ?? "").toString();

  let min = score(s.min);
  let max = score(s.max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  return {
    q: (s.q ?? "").toString().trim().slice(0, 120),
    kinds: list(s.kind, MATCH_KINDS),
    labels: list(s.label, MATCH_LABELS),
    side,
    min,
    max,
    segments: list(s.seg, undefined, 25),
    decisions: list(s.dec, DECISIONS),
    mutual: (s.mutual ?? "").toString() === "1",
    connection,
    connectionStatuses: list(s.cstatus, CONNECTION_STATUSES),
    versions: list(s.ver, undefined, 10),
    sort,
    page,
    selected: UUID_RE.test(raw) ? raw : null,
  };
}

export function matchesPageToOffset(page: number, pageSize = MATCHES_PAGE_SIZE) {
  return Math.max(0, (page - 1) * pageSize);
}

export function matchesTotalPages(total: number, pageSize = MATCHES_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function hasActiveMatchFilters(s: NormalizedMatchesSearch): boolean {
  return (
    s.q !== "" ||
    s.kinds.length > 0 ||
    s.labels.length > 0 ||
    s.min !== null ||
    s.max !== null ||
    s.segments.length > 0 ||
    s.decisions.length > 0 ||
    s.mutual ||
    s.connection !== "any" ||
    s.connectionStatuses.length > 0 ||
    s.versions.length > 0
  );
}

export const EMPTY_MATCHES_SEARCH: MatchesSearch = {
  q: "",
  kind: "",
  label: "",
  side: "any",
  min: "",
  max: "",
  seg: "",
  dec: "",
  mutual: "",
  conn: "any",
  cstatus: "",
  ver: "",
  sort: "score_desc",
  page: 1,
  m: "",
};
