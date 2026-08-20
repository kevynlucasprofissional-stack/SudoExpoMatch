import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  matchesSearchSchema,
  normalizeMatchesSearch,
  matchesPageToOffset,
  matchesTotalPages,
  hasActiveMatchFilters,
  MATCHES_PAGE_SIZE,
  MATCHES_MAX_LIMIT,
} from "@/features/admin/matchesUrlState";
import {
  matchesPageSchema,
  matchDetailSchema,
  matchRowSchema,
  hasPrivateKey,
  translateAdminMatchesError,
} from "@/features/admin/matchesSchemas";
import { matchesKey, matchDetailKey } from "@/features/admin/useAdminMatches";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const ROUTE = read("src/routes/admin_.matches.tsx");
const SHEET = read("src/features/admin/MatchDetailSheet.tsx");
const PRESENT = read("src/features/admin/matchesPresentation.ts");
const API = read("src/features/admin/useAdminMatches.ts");
const ADMIN = read("src/routes/admin.tsx");

const U = (n: string) =>
  `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const MID = U("1");
const PA = U("2");
const PB = U("3");

function row(over: Record<string, unknown> = {}) {
  return {
    id: MID,
    event_id: "sudoexpo-2026",
    kind: "complementar",
    algorithm_version: "v2.3",
    a_profile_id: PA,
    a_name: "Ana",
    a_company: "Padaria",
    a_segment_id: "alimentacao",
    a_segment_label: "Alimentação",
    b_profile_id: PB,
    b_name: "Bruno",
    b_company: "Tech",
    b_segment_id: "tecnologia",
    b_segment_label: "Tecnologia",
    score_for_a: 85,
    label_a: "alta_compatibilidade",
    score_for_b: 35,
    label_b: "conexao_possivel",
    score_gap: 50,
    decision_a: "interesse",
    decision_b: "sem_decisao",
    mutual: false,
    connection_id: null,
    connection_status: null,
    generated_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  };
}

function reason(over: Record<string, unknown> = {}) {
  return {
    id: U("4"),
    code: "relacao_complementar",
    label: "Precisa de software e o outro oferece",
    weight: 25,
    is_complement: true,
    profile_need_id: U("5"),
    profile_offer_id: U("6"),
    taxonomy_relation_id: U("7"),
    relation_weight: 80,
    rationale_historic: "Padarias precisam de PDV",
    need: {
      id: U("5"),
      label: "Sistema de PDV",
      detail: null,
      need_kind: "produto",
      is_priority: true,
      segment_id: "tecnologia",
      active: true,
    },
    offer: {
      id: U("6"),
      label: "Software de PDV",
      detail: null,
      segment_id: "tecnologia",
      active: true,
    },
    relation_current: {
      id: U("7"),
      relation_type: "necessita",
      weight: 80,
      active: true,
      rationale_current: "Relação mantida",
      from_item_id: U("8"),
      from_item_label: "Padaria",
      from_item_segment_id: "alimentacao",
      from_item_active: true,
      to_item_id: U("9"),
      to_item_label: "PDV",
      to_item_segment_id: "tecnologia",
      to_item_active: true,
      updated_at: "2026-01-01T00:00:00Z",
    },
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const profile = (id: string, name: string) => ({
  id,
  name,
  company: "Empresa",
  city: "Rio Verde",
  segment_id: "alimentacao",
  segment_label: "Alimentação",
  summary: "Resumo",
  is_demo: false,
  updated_at: "2026-01-01T00:00:00Z",
});

describe("Impl 10 — schemas", () => {
  it("valida linha da lista e preserva labels por perspectiva", () => {
    const parsed = matchRowSchema.parse(row());
    expect(parsed.label_a).toBe("alta_compatibilidade");
    expect(parsed.label_b).toBe("conexao_possivel");
    expect(parsed.label_a).not.toBe(parsed.label_b);
  });

  it("aceita company nula convertendo em string vazia", () => {
    expect(matchRowSchema.parse(row({ a_company: null })).a_company).toBe("");
  });

  it("valida página completa", () => {
    const page = matchesPageSchema.parse({ items: [row()], total: 1, limit: 20, offset: 0 });
    expect(page.total).toBe(1);
  });

  it("rejeita id inválido", () => {
    expect(() => matchRowSchema.parse(row({ id: "nope" }))).toThrow();
  });

  it("valida detalhe com motivo complementar auditável", () => {
    const d = matchDetailSchema.parse({
      match: {
        id: MID,
        event_id: "sudoexpo-2026",
        kind: "complementar",
        algorithm_version: "v2.3",
        is_active: true,
        score_for_a: 85,
        label_a: "alta_compatibilidade",
        score_for_b: 35,
        label_b: "conexao_possivel",
        score_gap: 50,
        decision_a: "interesse",
        decision_b: "agora_nao",
        mutual: false,
        generated_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      profile_a: profile(PA, "Ana"),
      profile_b: profile(PB, "Bruno"),
      connection: null,
      reasons_a: [reason()],
      reasons_b: [
        reason({
          id: U("a"),
          code: "match_direto",
          is_complement: false,
          profile_need_id: null,
          profile_offer_id: null,
          taxonomy_relation_id: null,
          relation_weight: null,
          rationale_historic: null,
          need: null,
          offer: null,
          relation_current: null,
        }),
      ],
    });
    expect(d.reasons_a[0].relation_current?.weight).toBe(80);
    expect(d.reasons_a[0].rationale_historic).toBe("Padarias precisam de PDV");
    // reason direto não inventa relação complementar
    expect(d.reasons_b[0].is_complement).toBe(false);
    expect(d.reasons_b[0].taxonomy_relation_id).toBeNull();
  });

  it("aceita relação removida (SET NULL) preservando histórico", () => {
    const r = reason({ taxonomy_relation_id: null, relation_current: null });
    const parsed = matchDetailSchema.shape.reasons_a.element.parse(r);
    expect(parsed.relation_current).toBeNull();
    expect(parsed.rationale_historic).toBe("Padarias precisam de PDV");
  });

  it("nenhum campo de contato privado no shape retornado", () => {
    expect(hasPrivateKey(row())).toBe(false);
    expect(hasPrivateKey(profile(PA, "Ana"))).toBe(false);
  });

  it("traduz erros da RPC", () => {
    expect(translateAdminMatchesError(new Error("forbidden"))).toMatch(/Acesso negado/);
    expect(translateAdminMatchesError(new Error("not_found"))).toMatch(/não encontrado/i);
    expect(translateAdminMatchesError(new Error("not_authenticated"))).toMatch(/Sessão/);
  });
});

describe("Impl 10 — estado de URL", () => {
  const base = matchesSearchSchema.parse({});

  it("defaults saudáveis", () => {
    const s = normalizeMatchesSearch(base);
    expect(s.page).toBe(1);
    expect(s.side).toBe("any");
    expect(s.sort).toBe("score_desc");
    expect(hasActiveMatchFilters(s)).toBe(false);
  });

  it("sanitiza listas e descarta valores desconhecidos", () => {
    const s = normalizeMatchesSearch({ kind: "direto,hackeado", label: "alta_compatibilidade,x" });
    expect(s.kinds).toEqual(["direto"]);
    expect(s.labels).toEqual(["alta_compatibilidade"]);
  });

  it("clampa scores e inverte faixa invertida", () => {
    const s = normalizeMatchesSearch({ min: "900", max: "-5" });
    expect(s.min).toBe(0);
    expect(s.max).toBe(100);
  });

  it("ignora perspectiva inválida", () => {
    expect(normalizeMatchesSearch({ side: "c" }).side).toBe("any");
  });

  it("só aceita uuid no match selecionado", () => {
    expect(normalizeMatchesSearch({ m: "abc" }).selected).toBeNull();
    expect(normalizeMatchesSearch({ m: MID }).selected).toBe(MID);
  });

  it("paginação server-side", () => {
    expect(matchesPageToOffset(3)).toBe(2 * MATCHES_PAGE_SIZE);
    expect(matchesTotalPages(0)).toBe(1);
    expect(matchesTotalPages(41)).toBe(Math.ceil(41 / MATCHES_PAGE_SIZE));
    expect(MATCHES_MAX_LIMIT).toBeLessThanOrEqual(100);
  });

  it("detecta filtros ativos", () => {
    expect(hasActiveMatchFilters(normalizeMatchesSearch({ mutual: "1" }))).toBe(true);
    expect(hasActiveMatchFilters(normalizeMatchesSearch({ conn: "with" }))).toBe(true);
  });
});

describe("Impl 10 — query keys", () => {
  const f = {
    ...normalizeMatchesSearch(matchesSearchSchema.parse({})),
    offset: 0,
  };

  it("chave muda com qualquer filtro", () => {
    const a = JSON.stringify(matchesKey("ev", f));
    expect(JSON.stringify(matchesKey("ev", { ...f, mutual: true }))).not.toBe(a);
    expect(JSON.stringify(matchesKey("ev", { ...f, kinds: ["direto"] }))).not.toBe(a);
    expect(JSON.stringify(matchesKey("ev", { ...f, side: "both" }))).not.toBe(a);
    expect(JSON.stringify(matchesKey("ev", { ...f, offset: 20 }))).not.toBe(a);
    expect(JSON.stringify(matchesKey("ev2", f))).not.toBe(a);
  });

  it("ordem das listas não altera a chave", () => {
    expect(JSON.stringify(matchesKey("ev", { ...f, kinds: ["direto", "inverso"] }))).toBe(
      JSON.stringify(matchesKey("ev", { ...f, kinds: ["inverso", "direto"] })),
    );
  });

  it("detalhe tem chave própria", () => {
    expect(matchDetailKey(MID)).toEqual(["admin", "match-detail", MID]);
  });
});

describe("Impl 10 — contratos de código", () => {
  it("API só muta governança humana (IMPL 15), nunca dados do matcher", () => {
    // Impl 10 era read-only; IMPL 15 adicionou apenas o "match revisado".
    expect(API.match(/useMutation\(/g) ?? []).toHaveLength(1);
    expect(API).toMatch(/admin_set_match_reviewed/);
    // a única RPC de escrita é a de revisão administrativa
    expect(API.match(/supabase\.rpc\("[a-z_]+"/g) ?? []).toContain('supabase.rpc("admin_set_match_reviewed"');
    expect(API).not.toMatch(/\.update\(|\.insert\(|\.delete\(/);
    expect(API).toMatch(/admin_list_matches/);
    expect(API).toMatch(/admin_get_match_detail/);
  });

  it("rota registra filtros server-side e paginação", () => {
    expect(API).toMatch(/_limit/);
    expect(API).toMatch(/_offset/);
    expect(ROUTE).toMatch(/useDebouncedValue/);
  });

  it("UI usa labels por perspectiva e decisões autoritativas", () => {
    expect(ROUTE).toMatch(/label_a/);
    expect(ROUTE).toMatch(/label_b/);
    expect(SHEET).toMatch(/label_a/);
    expect(ROUTE).not.toMatch(/m\.label[^_a-zA-Z]/);
    expect(SHEET).not.toMatch(/match\.label[^_a-zA-Z]/);
    expect(PRESENT).toMatch(/sideLabelText/);
  });

  it("detalhe renderiza cadeia complementar auditável", () => {
    expect(SHEET).toMatch(/Relação complementar/);
    expect(SHEET).toMatch(/rationale_historic/);
    expect(SHEET).toMatch(/relation_current/);
  });

  it("não expõe contato nem ações de edição", () => {
    for (const src of [ROUTE, SHEET]) {
      expect(src).not.toMatch(/whatsapp|recovery_code|phone_e164/i);
      expect(src).not.toMatch(/reveal_contact/);
    }
  });

  it("estados de carregamento, erro e vazio existem", () => {
    expect(ROUTE).toMatch(/matches-loading/);
    expect(ROUTE).toMatch(/matches-empty/);
    expect(ROUTE).toMatch(/translateAdminMatchesError/);
  });

  it("mobile: lista em cards, sem tabela", () => {
    expect(ROUTE).not.toMatch(/<table|<thead|<tbody/);
    expect(ROUTE).toMatch(/asymmetry-badge/);
  });

  it("admin tem link para a auditoria", () => {
    expect(ADMIN).toMatch(/\/admin\/matches/);
  });
});
