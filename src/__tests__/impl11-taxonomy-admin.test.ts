import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

import {
  hasActiveTaxonomyFilters,
  normalizeTaxonomySearch,
  parseSynonymsInput,
  sanitizeSynonyms,
  taxonomyFormSchema,
  taxonomyPageToOffset,
  taxonomyTotalPages,
  translateTaxonomyError,
} from "@/features/admin/taxonomySchemas";

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], {
    encoding: "utf8",
    env: process.env,
  }).trim();
}

const ADMIN_FNS = [
  "admin_list_taxonomy_items",
  "admin_get_taxonomy_item_detail",
  "admin_create_taxonomy_item",
  "admin_update_taxonomy_item",
  "admin_set_taxonomy_item_active",
];

d("Impl 11 — RPCs administrativas da taxonomia", () => {
  it("todas existem, são SECURITY DEFINER e fixam search_path", () => {
    for (const fn of ADMIN_FNS) {
      const row = q(
        `SELECT prosecdef::text||'|'||COALESCE(array_to_string(proconfig,','),'') FROM pg_proc WHERE proname='${fn}'`,
      );
      expect(row, fn).toContain("true|");
      expect(row, fn).toContain("search_path=public");
    }
  });

  it("anon não pode executar nenhuma RPC administrativa", () => {
    for (const fn of ADMIN_FNS) {
      const r = q(
        `SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))::text FROM pg_proc p WHERE p.proname='${fn}'`,
      );
      expect(r, fn).toBe("false");
    }
  });

  it("authenticated pode executar (o gate de admin é dentro da função)", () => {
    for (const fn of ADMIN_FNS) {
      const r = q(
        `SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text FROM pg_proc p WHERE p.proname='${fn}'`,
      );
      expect(r, fn).toBe("true");
    }
  });

  it("helpers internos não são executáveis por clientes", () => {
    for (const fn of [
      "_admin_require_event_admin",
      "_sanitize_synonyms",
      "_taxonomy_unique_slug",
      "_validate_taxonomy_payload",
      "_taxonomy_item_json",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const r = q(
          `SELECT bool_or(has_function_privilege('${role}', p.oid, 'EXECUTE'))::text FROM pg_proc p WHERE p.proname='${fn}'`,
        );
        expect(r, `${fn}/${role}`).toBe("false");
      }
    }
  });

  it("toda mutação de taxonomia grava auditoria", () => {
    for (const fn of [
      "admin_create_taxonomy_item",
      "admin_update_taxonomy_item",
      "admin_set_taxonomy_item_active",
    ]) {
      const src = q(`SELECT prosrc FROM pg_proc WHERE proname='${fn}'`);
      expect(src, fn).toContain("audit_logs");
      expect(src, fn).toContain("_admin_require_event_admin");
    }
  });

  it("nenhuma RPC apaga itens de taxonomia (histórico preservado)", () => {
    for (const fn of ADMIN_FNS) {
      const src = q(`SELECT prosrc FROM pg_proc WHERE proname='${fn}'`);
      expect(src.toLowerCase(), fn).not.toContain("delete from public.taxonomy_items");
    }
  });
});

describe("Impl 11 — contratos e estado de URL da taxonomia", () => {
  it("sanitizeSynonyms espelha a regra do banco", () => {
    expect(sanitizeSynonyms(["  PDV ", "pdv", "PdV", "", "   "])).toEqual(["PDV"]);
    expect(sanitizeSynonyms([" a".repeat(1), "b".repeat(81)])).toEqual(["a"]);
    expect(sanitizeSynonyms(Array.from({ length: 40 }, (_, i) => `s${i}`))).toHaveLength(20);
  });

  it("parseSynonymsInput divide por vírgula", () => {
    expect(parseSynonymsInput("pdv, Ponto de venda ,pdv")).toEqual(["pdv", "Ponto de venda"]);
  });

  it("formulário valida label, segmento e tipo", () => {
    expect(
      taxonomyFormSchema.safeParse({
        label: "a",
        segmentId: "x",
        kind: "both",
        description: "",
        synonyms: [],
      }).success,
    ).toBe(false);
    expect(
      taxonomyFormSchema.safeParse({
        label: "Consultoria",
        segmentId: "",
        kind: "both",
        description: "",
        synonyms: [],
      }).success,
    ).toBe(false);
    expect(
      taxonomyFormSchema.safeParse({
        label: "Consultoria",
        segmentId: "servicos",
        kind: "offer",
        description: "ok",
        synonyms: ["a"],
      }).success,
    ).toBe(true);
  });

  it("normaliza filtros da URL e ignora valores inválidos", () => {
    const s = normalizeTaxonomySearch({
      q: "  contab  ",
      kind: "offer,invalido",
      status: "hacker",
      seg: "servicos,industria",
      page: -5 as never,
      i: "nao-uuid",
    });
    expect(s.q).toBe("contab");
    expect(s.kinds).toEqual(["offer"]);
    expect(s.status).toBe("any");
    expect(s.segments).toEqual(["servicos", "industria"]);
    expect(s.page).toBe(1);
    expect(s.selected).toBeNull();
    expect(hasActiveTaxonomyFilters(s)).toBe(true);
  });

  it("paginação", () => {
    expect(taxonomyPageToOffset(3)).toBe(40);
    expect(taxonomyTotalPages(41)).toBe(3);
    expect(taxonomyTotalPages(0)).toBe(1);
  });

  it("traduz erros do backend", () => {
    expect(translateTaxonomyError(new Error("forbidden"))).toContain("administradores");
    expect(translateTaxonomyError(new Error("invalid_label"))).toContain("120");
  });
});
