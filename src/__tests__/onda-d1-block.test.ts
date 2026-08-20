import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  QUEUE_SORTS,
  QUEUE_SORT_LABEL,
  QUEUE_SCOPES,
  type QueueSort,
} from "@/features/staff/useOperationalQueue";
import { equipeSearchSchema, normalizeEquipeSearch } from "@/features/staff/urlState";

/**
 * BLOCO D1 — testes contratuais dedicados ao hardening da fila.
 * Cobrem: labels/opções de ordenação; normalização/serialização da URL;
 * e um contrato SQL sobre a migration incremental da RPC
 * `staff_list_connections_v2` (ordenação antes da paginação + desempate
 * estável + agregação depois do LIMIT/OFFSET).
 */

describe("D1 — labels/opções de ordenação", () => {
  it("expõe exatamente as 4 opções previstas na spec", () => {
    expect([...QUEUE_SORTS].sort()).toEqual([
      "created",
      "priority",
      "updated",
      "waiting",
    ] as QueueSort[]);
  });

  it("todas as opções têm rótulo humano em pt-BR", () => {
    expect(QUEUE_SORT_LABEL).toMatchObject({
      priority: "Prioridade",
      waiting: "Maior espera",
      updated: "Atualização recente",
      created: "Criação recente",
    });
    for (const s of QUEUE_SORTS) {
      expect(QUEUE_SORT_LABEL[s]).toBeTruthy();
    }
  });

  it("scopes conhecidos ficam estáveis (allowlist da UI)", () => {
    expect([...QUEUE_SCOPES].sort()).toEqual([
      "all",
      "closed",
      "map_pending",
      "mapped",
      "mine",
      "pending",
      "unassigned",
    ]);
  });
});

describe("D1 — URL: mudança de filtro reseta page", () => {
  it("simula o fluxo do updateSearch: alterar scope leva page para 1", () => {
    const before = normalizeEquipeSearch(equipeSearchSchema.parse({ scope: "mine", page: "7" }));
    expect(before.page).toBe(7);
    // Depois do patch { scope, page: 1 } em updateSearch:
    const after = normalizeEquipeSearch(
      equipeSearchSchema.parse({ ...before, scope: "closed", page: 1 }),
    );
    expect(after.page).toBe(1);
    expect(after.scope).toBe("closed");
  });

  it("busca debounced não desloca page quando o texto não muda", () => {
    const s = normalizeEquipeSearch(equipeSearchSchema.parse({ q: "acme", page: "3" }));
    expect(s.q).toBe("acme");
    expect(s.page).toBe(3);
  });
});

// --------------------------------------------------------------------------
// Contrato SQL: garante que a migration incremental do BLOCO D1 aplica
// ordenação determinística ANTES da paginação e usa desempates estáveis.
// --------------------------------------------------------------------------

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260724180242_17aaae64-85cb-4b01-ad8a-ef02f8d76ae5.sql",
);

describe("D1 — contrato SQL da RPC staff_list_connections_v2", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("existe migration incremental (não edita a original da Onda D)", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.staff_list_connections_v2");
  });

  it("valida _scope e _sort por allowlist com erro dedicado", () => {
    expect(sql).toMatch(
      /IF\s+v_scope\s+NOT\s+IN\s*\(\s*'all','mine','unassigned','pending','closed'\s*\)/i,
    );
    expect(sql).toMatch(/RAISE EXCEPTION 'invalid_scope'/);
    expect(sql).toMatch(
      /IF\s+v_sort\s+NOT\s+IN\s*\(\s*'priority','waiting','updated','created'\s*\)/i,
    );
    expect(sql).toMatch(/RAISE EXCEPTION 'invalid_sort'/);
  });

  it("ordena ANTES de paginar (ROW_NUMBER OVER ORDER BY, depois janela por rn)", () => {
    // ROW_NUMBER com ORDER BY dentro da CTE ordered.
    expect(sql).toMatch(/ROW_NUMBER\s*\(\s*\)\s*OVER\s*\(\s*ORDER BY/i);
    // Janela por rn (LIMIT/OFFSET aplicados sobre a ordenação estável).
    expect(sql).toMatch(/WHERE\s+rn\s*>\s*v_offset\s+AND\s+rn\s*<=\s*v_offset\s*\+\s*v_limit/i);
  });

  it("aplica desempate estável por updated_at DESC, created_at DESC, id ASC", () => {
    // Última tríade dentro do ORDER BY do ROW_NUMBER.
    const orderBlock = sql.match(/ROW_NUMBER[\s\S]*?\)\s*AS rn/i)?.[0] ?? "";
    expect(orderBlock).toMatch(/f\.updated_at\s+DESC/i);
    expect(orderBlock).toMatch(/f\.created_at\s+DESC/i);
    expect(orderBlock).toMatch(/f\.id\s+ASC/i);
  });

  it("agrega jsonb_agg APÓS a paginação, preservando a ordem por rn", () => {
    expect(sql).toMatch(
      /jsonb_agg\(\s*\(to_jsonb\(p\)\s*-\s*'rn'\s*-\s*'status_order'\)\s*ORDER BY p\.rn\s*\)/,
    );
  });

  it("total é count(*) da MESMA CTE filtered (mesmos filtros)", () => {
    expect(sql).toMatch(/\(SELECT\s+count\(\*\)::int\s+FROM\s+filtered\)/i);
  });

  it("não usa RIGHT JOIN morto nem CTE 'base' redundante", () => {
    expect(sql).not.toMatch(/RIGHT\s+JOIN/i);
    // A migration original tinha uma CTE 'base' + reagregação; a nova não deve reintroduzi-la.
    expect(sql).not.toMatch(/\bWITH\s+base\s+AS\b/i);
  });

  it("isola por event_id em todas as agregações de contagem", () => {
    // filtered CTE + counts_by_status + counts_by_scope precisam filtrar por event_id.
    const eventFilters = sql.match(/event_id\s*=\s*_event_id/gi) ?? [];
    expect(eventFilters.length).toBeGreaterThanOrEqual(3);
  });

  it("bloqueia acesso sem autenticação e sem papel no evento", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'not_authenticated'/);
    expect(sql).toMatch(/has_any_event_role\(_event_id,\s*v_uid\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'forbidden'/);
  });

  it("mantém GRANT EXECUTE para authenticated na assinatura correta", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.staff_list_connections_v2\(\s*text,\s*public\.connection_status\[\],\s*text\[\],\s*text,\s*text,\s*text,\s*integer,\s*integer\s*\)\s+TO authenticated/,
    );
  });
});
