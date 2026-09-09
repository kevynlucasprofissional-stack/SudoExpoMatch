/**
 * Canonicalização conservadora de itens do onboarding — risco residual do
 * incidente de cadastro de 09/09/2026 (texto livre com label idêntico a item
 * ativo do catálogo, salvo com `taxonomy_item_id = null`).
 */
import { describe, expect, it } from "vitest";

import {
  canonicalizeDraftItems,
  canonicalizeItem,
  canonicalizeItems,
  findCanonicalTaxonomyItem,
  type CanonicalCatalogItem,
} from "@/features/onboarding/canonicalizeItems";
import { findDuplicatePair } from "@/features/onboarding/itemIdentity";

const AGRO = "agro";
const INSUMOS: CanonicalCatalogItem = {
  id: "11111111-1111-1111-1111-111111111111",
  segment_id: AGRO,
  label: "Insumos agrícolas",
  kind: "both",
  synonyms: ["Defensivos e fertilizantes"],
};
const MAQUINAS: CanonicalCatalogItem = {
  id: "22222222-2222-2222-2222-222222222222",
  segment_id: AGRO,
  label: "Máquinas agrícolas",
  kind: "offer",
  synonyms: [],
};
const SEM_SEGMENTO: CanonicalCatalogItem = {
  id: "33333333-3333-3333-3333-333333333333",
  segment_id: null,
  label: "Consultoria",
  kind: "both",
  synonyms: [],
};
const CATALOG = [INSUMOS, MAQUINAS, SEM_SEGMENTO];

const item = (label: string, taxonomyItemId: string | null = null, segmentId = "servicos") => ({
  label,
  segmentId,
  taxonomyItemId,
});

describe("findCanonicalTaxonomyItem", () => {
  it("casa por label exato normalizado", () => {
    expect(
      findCanonicalTaxonomyItem({ label: "Insumos agrícolas", kind: "need", catalog: CATALOG })?.id,
    ).toBe(INSUMOS.id);
  });

  it("ignora acento, caixa e espaços extras", () => {
    for (const label of ["insumos agricolas", "  INSUMOS   AGRÍCOLAS ", "Insumos\tAgricolas"]) {
      expect(findCanonicalTaxonomyItem({ label, kind: "need", catalog: CATALOG })?.id).toBe(
        INSUMOS.id,
      );
    }
  });

  it("casa por sinônimo exato normalizado", () => {
    expect(
      findCanonicalTaxonomyItem({
        label: "defensivos e fertilizantes",
        kind: "offer",
        catalog: CATALOG,
      })?.id,
    ).toBe(INSUMOS.id);
  });

  it("respeita kind: necessidade não casa com item só de oferta", () => {
    expect(
      findCanonicalTaxonomyItem({ label: "Máquinas agrícolas", kind: "need", catalog: CATALOG }),
    ).toBeNull();
    expect(
      findCanonicalTaxonomyItem({ label: "Máquinas agrícolas", kind: "offer", catalog: CATALOG })
        ?.id,
    ).toBe(MAQUINAS.id);
  });

  it("não vincula item sem segmento autoritativo (backend rejeitaria)", () => {
    expect(
      findCanonicalTaxonomyItem({ label: "Consultoria", kind: "offer", catalog: CATALOG }),
    ).toBeNull();
  });

  it("ambiguidade não escolhe nada", () => {
    const duplicado: CanonicalCatalogItem = { ...INSUMOS, id: "44444444-4444-4444-4444-444444444444", segment_id: "industria" };
    expect(
      findCanonicalTaxonomyItem({
        label: "Insumos agrícolas",
        kind: "need",
        catalog: [...CATALOG, duplicado],
      }),
    ).toBeNull();
  });

  it("não usa substring nem similaridade", () => {
    expect(
      findCanonicalTaxonomyItem({ label: "Insumos", kind: "need", catalog: CATALOG }),
    ).toBeNull();
    expect(
      findCanonicalTaxonomyItem({ label: "Insumos agricolas premium", kind: "need", catalog: CATALOG }),
    ).toBeNull();
  });
});

describe("canonicalizeItem", () => {
  it("caso real: texto livre vira item canônico com o segmento autoritativo", () => {
    const out = canonicalizeItem(item("Insumos agrícolas"), { kind: "need", catalog: CATALOG });
    expect(out.taxonomyItemId).toBe(INSUMOS.id);
    expect(out.segmentId).toBe(AGRO);
  });

  it("item já canônico é preservado", () => {
    const original = item("Rótulo editado", MAQUINAS.id, "agro");
    expect(canonicalizeItem(original, { kind: "offer", catalog: CATALOG })).toEqual(original);
  });

  it("não reaproveita um id já usado por outro item da lista", () => {
    const out = canonicalizeItem(item("Insumos agrícolas"), {
      kind: "need",
      catalog: CATALOG,
      usedTaxonomyIds: [INSUMOS.id],
    });
    expect(out.taxonomyItemId).toBeNull();
  });

  it("sem correspondência, permanece texto livre", () => {
    const out = canonicalizeItem(item("Aluguel de galpão"), { kind: "need", catalog: CATALOG });
    expect(out.taxonomyItemId).toBeNull();
    expect(out.segmentId).toBe("servicos");
  });
});

describe("canonicalizeItems / draft antigo", () => {
  it("recupera rascunho antigo salvo localmente", () => {
    const draft = {
      offers: [item("máquinas  agricolas")],
      needs: [item("Insumos Agricolas")],
    };
    const out = canonicalizeDraftItems(draft, CATALOG);
    expect(out.offers[0].taxonomyItemId).toBe(MAQUINAS.id);
    expect(out.needs[0].taxonomyItemId).toBe(INSUMOS.id);
  });

  it("catálogo vazio ou ausente não altera nada", () => {
    const draft = { offers: [item("Insumos agrícolas")], needs: [] };
    expect(canonicalizeDraftItems(draft, [])).toEqual(draft);
    expect(canonicalizeDraftItems(draft, null)).toEqual(draft);
  });

  it("não cria duplicidade nova por sinônimo: só o primeiro recebe o id", () => {
    const out = canonicalizeItems([item("Insumos agrícolas"), item("Defensivos e fertilizantes")], {
      kind: "offer",
      catalog: CATALOG,
    });
    expect(out[0].taxonomyItemId).toBe(INSUMOS.id);
    expect(out[1].taxonomyItemId).toBeNull();
  });

  it("preserva a detecção de duplicatas existente (não deduplica em silêncio)", () => {
    const lista = [item("Insumos agrícolas"), item("insumos  agricolas")];
    const out = canonicalizeItems(lista, { kind: "need", catalog: CATALOG });
    expect(out).toHaveLength(2);
    expect(findDuplicatePair(out)).not.toBeNull();
  });
});
