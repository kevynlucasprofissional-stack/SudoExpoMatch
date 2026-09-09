import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260909194000_matcher_taxonomy_governance.sql",
);
const taxonomyRoute = read("src/routes/admin_.taxonomia.tsx");
const statusCard = read("src/features/admin/MatcherTaxonomyStatusCard.tsx");
const relationForm = read("src/features/admin/TaxonomyRelationForm.tsx");
const relationSheet = read("src/features/admin/TaxonomyItemSheet.tsx");

describe("Matcher v2.4 — governança de snapshots taxonômicos", () => {
  it("versiona a taxonomia e registra a revisão aplicada por evento", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.matcher_config_state/);
    expect(migration).toMatch(/taxonomy_revision bigint NOT NULL/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.matcher_event_state/);
    expect(migration).toMatch(/applied_taxonomy_revision bigint NOT NULL/);
    expect(migration).toMatch(/bump_matcher_revision_taxonomy_items/);
    expect(migration).toMatch(/bump_matcher_revision_taxonomy_relations/);
  });

  it("expõe diagnóstico e rebuild somente por RPCs administrativas", () => {
    expect(migration).toMatch(/admin_get_matcher_taxonomy_status/);
    expect(migration).toMatch(/admin_recompute_event_matches/);
    expect(migration).toMatch(/_admin_require_event_admin\(_event_id\)/);
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/matcher_event_rebuild/);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_recompute_event_matches\(text\) FROM PUBLIC, anon/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_recompute_event_matches\(text\) TO authenticated/,
    );
  });

  it("mantém o estado interno protegido por RLS e sem acesso direto autenticado", () => {
    expect(migration).toMatch(/ALTER TABLE public\.matcher_config_state ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/ALTER TABLE public\.matcher_event_state ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(
      /REVOKE ALL ON public\.matcher_config_state FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON public\.matcher_event_state FROM PUBLIC, anon, authenticated/,
    );
  });

  it("recalcula apenas perfis elegíveis do evento e reaplica o matcher real", () => {
    expect(migration).toMatch(/p\.event_id = _event_id/);
    expect(migration).toMatch(/cs\.consent_type = 'matchmaking'/);
    expect(migration).toMatch(/cs\.granted = true/);
    expect(migration).toMatch(/_recompute_matches_for_profile\(v_profile\.id, _event_id\)/);
  });

  it("admin da taxonomia usa o evento selecionado também no detalhe/mutações", () => {
    expect(taxonomyRoute).toMatch(/MatcherTaxonomyStatusCard eventId=\{selectedEventId\}/);
    expect(taxonomyRoute).toMatch(
      /<TaxonomyItemSheet[\s\S]*?eventId=\{selectedEventId\}/,
    );
    expect(taxonomyRoute).not.toMatch(
      /<TaxonomyItemSheet[\s\S]*?eventId=\{EVENT_ID\}/,
    );
  });

  it("a UI expõe explicitamente a semântica NECESSIDADE → OFERTA", () => {
    expect(relationForm).toMatch(/Sentido comercial \(necessidade → oferta\)/);
    expect(relationForm).toMatch(/Quem PRECISA de/);
    expect(relationForm).toMatch(/empresa que OFERECE/);
    expect(relationForm).toMatch(/o inverso só existe se for cadastrado separadamente/);
    expect(relationSheet).toMatch(/PRECISA DE:/);
    expect(relationSheet).toMatch(/OFERECE:/);
    expect(relationSheet).toMatch(/O inverso não é inferido automaticamente/);
  });

  it("o painel informa dirty state, cobertura e rebuild explícito", () => {
    expect(statusCard).toMatch(/rebuild necessário/);
    expect(statusCard).toMatch(/Cobertura de ofertas/);
    expect(statusCard).toMatch(/Cobertura de necessidades/);
    expect(statusCard).toMatch(/Relações complementares/);
    expect(statusCard).toMatch(/Recalcular matches do evento/);
  });
});
