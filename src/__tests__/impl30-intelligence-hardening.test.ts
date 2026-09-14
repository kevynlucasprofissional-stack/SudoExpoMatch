import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  LOW_SCORE_MAX,
  PERMISSIVE_STRONG_MIN_DECISIONS,
  PROPENSITY_BUCKETS,
  SCORE_BUCKETS,
  hasPrivateKey,
  intelligenceBehaviorSchema,
  intelligenceMatcherSchema,
  intelligenceOverviewSchema,
  intelligenceTaxonomySchema,
} from "@/features/admin/intelligenceSchemas";
import {
  interestRate,
  kindRows,
  outcomesCoverage,
  groundTruthStatus,
  propensityRows,
  reasonLiftRows,
  scoreMatrix,
  snapshotDrift,
  taxonomyCoverage,
  taxonomySideRows,
  taxonomySourceRows,
  taxonomySegmentRows,
} from "@/features/admin/intelligencePresentation";
import { OUTCOME_KINDS } from "@/features/staff/outcomes";

/**
 * IMPL 30 — hardening do SudoExpo Intelligence.
 *
 * Complementa `impl29` cobrindo o que faltava explicitamente:
 * - resultados fortes lidos de `connection_events.action = 'outcome:<kind>'`;
 * - cobertura taxonômica somente sobre itens ATIVOS com `taxonomy_item_id`;
 * - fronteiras de bucket e `low score` estritamente `< 40`;
 * - perspectiva A/B, drift e admin-only garantidos no SQL;
 * - nenhum contato/credencial no retorno das RPCs;
 * - regressão determinística de Reason Lift e da matriz de score.
 *
 * Nada aqui altera pesos, thresholds ou o matcher.
 */

const MIGRATION_PATH =
  "supabase/migrations/20260914045821_b9a0b7c4-000e-4e10-862f-c413fd5c031a.sql";
const migration = readFileSync(MIGRATION_PATH, "utf8");
const routeSrc = readFileSync("src/routes/admin_.inteligencia.tsx", "utf8");
const hookSrc = readFileSync("src/features/admin/useAdminIntelligence.ts", "utf8");
const outcomesTabSrc = readFileSync("src/features/admin/intelligence/OutcomesTab.tsx", "utf8");

const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

const baseOverview = {
  event_id: "sudoexpo-2026",
  generated_at: "2026-09-14T05:00:00Z",
  participants_active: 10,
  matches_active: 40,
  algorithm_versions: { "v2.4": 40 },
  decisions_total: 0,
  participants_with_decision: 0,
  interests: 0,
  declines: 0,
  mutual_matches: 0,
  selective_participants: 0,
  permissive_strong_participants: 0,
  selective_high: { decisions: 0, interests: 0 },
  selective_low: { decisions: 0, interests: 0 },
  low_score_interests: { total: 0, permissive_strong: 0, selective: 0, other: 0 },
  score_buckets: [],
  taxonomy: { needs_total: 0, needs_canonical: 0, offers_total: 0, offers_canonical: 0 },
  snapshot: { decisions: 0, drift: 0, unknown: 0 },
  connections: { total: 0, by_status: {}, offline: 0 },
  outcomes: { by_kind: {}, total: 0, connections_with_outcome: 0 },
};

// ------------------------------------------------------- resultados fortes

describe("resultados fortes (strong outcomes)", () => {
  it("reconhece os quatro kinds reais do projeto", () => {
    expect([...OUTCOME_KINDS].sort()).toEqual([
      "conversa_realizada",
      "negocio_reportado",
      "proposta_solicitada",
      "reuniao_agendada",
    ]);
  });

  it("o SQL lê o formato real action='outcome:<kind>' em todas as leituras que usam outcome", () => {
    const hits = migration.match(/e\.action LIKE 'outcome:%'/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("replace(e.action, 'outcome:', '')");
  });

  it("a aba de outcomes usa exatamente a lista canônica de kinds", () => {
    expect(outcomesTabSrc).toContain('from "@/features/staff/outcomes"');
    expect(outcomesTabSrc).toContain("OUTCOME_KINDS.map");
  });

  it("cobertura de outcomes usa conexões como denominador e sinaliza insuficiência", () => {
    const withOutcomes = intelligenceOverviewSchema.parse({
      ...baseOverview,
      connections: { total: 40, by_status: { concluido: 40 }, offline: 0 },
      outcomes: {
        by_kind: { conversa_realizada: 6, reuniao_agendada: 2 },
        total: 8,
        connections_with_outcome: 6,
      },
    });
    const cov = outcomesCoverage(withOutcomes);
    expect(cov.numerator).toBe(6);
    expect(cov.denominator).toBe(40);
    expect(cov.pct).toBe(15);
    expect(groundTruthStatus(withOutcomes).sufficient).toBe(true);

    const none = intelligenceOverviewSchema.parse({
      ...baseOverview,
      connections: { total: 40, by_status: { concluido: 40 }, offline: 0 },
    });
    expect(outcomesCoverage(none).pct).toBe(0);
    expect(groundTruthStatus(none).sufficient).toBe(false);
  });
});

// ------------------------------------------------- taxonomia: só itens ativos

describe("cobertura taxonômica", () => {
  it("o SQL restringe a itens ativos e conta apenas taxonomy_item_id não nulo", () => {
    expect(migration).toContain("FROM public.profile_needs n WHERE n.event_id = _event_id AND n.active");
    expect(migration).toContain("FROM public.profile_offers o WHERE o.event_id = _event_id AND o.active");
    expect(migration).toContain("FILTER (WHERE n.taxonomy_item_id IS NOT NULL)");
    expect(migration).toContain("FILTER (WHERE o.taxonomy_item_id IS NOT NULL)");
    expect(migration).toContain("WHERE taxonomy_item_id IS NULL");
  });

  it("cobertura é canônicos/ativos com denominador visível", () => {
    const o = intelligenceOverviewSchema.parse({
      ...baseOverview,
      taxonomy: { needs_total: 200, needs_canonical: 50, offers_total: 0, offers_canonical: 0 },
    });
    const cov = taxonomyCoverage(o);
    expect(cov.needs.pct).toBe(25);
    expect(cov.needs.denominator).toBe(200);
    expect(cov.offers.pct).toBeNull();
  });

  it("linhas de taxonomia sobrevivem a payload vazio", () => {
    const t = intelligenceTaxonomySchema.parse({
      event_id: "sudoexpo-2026",
      generated_at: "2026-09-14T05:00:00Z",
      taxonomy_items_active: 0,
      taxonomy_relations_active: 0,
    });
    expect(taxonomySideRows(t)).toEqual([]);
    expect(taxonomySourceRows(t)).toEqual([]);
    expect(taxonomySegmentRows(t)).toEqual([]);
  });
});

// ------------------------------------------------------------ buckets / low

describe("buckets e limiar de score baixo", () => {
  it("mantém exatamente as cinco faixas combinadas", () => {
    expect([...SCORE_BUCKETS]).toEqual(["0-19", "20-39", "40-59", "60-74", "75+"]);
    expect([...PROPENSITY_BUCKETS]).toEqual([
      "0-10%",
      "10-25%",
      "25-50%",
      "50-75%",
      "75-90%",
      "90-100%",
    ]);
  });

  it("as fronteiras do SQL correspondem às faixas (39 é baixo, 40 não é)", () => {
    expect(migration).toContain("WHEN _score < 20 THEN '0-19'");
    expect(migration).toContain("WHEN _score < 40 THEN '20-39'");
    expect(migration).toContain("WHEN _score < 60 THEN '40-59'");
    expect(migration).toContain("WHEN _score < 75 THEN '60-74'");
    expect(migration).toContain("ELSE '75+'");
    expect(LOW_SCORE_MAX).toBe(40);
    expect(migration).toContain("score < 40");
    expect(migration).not.toContain("score <= 40");
  });

  it("permissivo forte exige pelo menos 5 decisões e 100% interesse", () => {
    expect(PERMISSIVE_STRONG_MIN_DECISIONS).toBe(5);
    expect(migration).toContain("(n >= 5 AND ni = n) AS permissive_strong");
    expect(migration).toContain("(ni > 0 AND nn > 0) AS selective");
  });
});

// ------------------------------------------------------- perspectiva e drift

describe("perspectiva A/B, sem_decisao e drift", () => {
  it("todas as leituras de decisão derivam o score da perspectiva de quem decidiu", () => {
    const perspective =
      migration.match(
        /CASE WHEN dd\.profile_id = m\.a_profile_id THEN m\.score_for_a ELSE m\.score_for_b END/g,
      ) ?? [];
    expect(perspective.length).toBeGreaterThanOrEqual(3);
  });

  it("sem_decisao nunca entra no denominador", () => {
    const filters = migration.match(/dd\.decision::text <> 'sem_decisao'/g) ?? [];
    expect(filters.length).toBeGreaterThanOrEqual(3);
    const o = intelligenceOverviewSchema.parse({
      ...baseOverview,
      decisions_total: 10,
      interests: 4,
      declines: 6,
    });
    // 10 decisões registradas: qualquer `sem_decisao` ficou fora do SQL.
    expect(interestRate(o).denominator).toBe(10);
    expect(interestRate(o).pct).toBe(40);
  });

  it("drift é decisão cujo snapshot foi regerado depois", () => {
    expect(migration).toContain("generated_at > decided_at");
    const o = intelligenceOverviewSchema.parse({
      ...baseOverview,
      snapshot: { decisions: 200, drift: 50, unknown: 0 },
    });
    expect(snapshotDrift(o).pct).toBe(25);
  });
});

// --------------------------------------------------- segurança / admin-only

describe("segurança das RPCs de inteligência", () => {
  it("exigem admin do evento e não usam service role nem escrita", () => {
    expect(migration.match(/_admin_require_event_admin\(_event_id\)/g)?.length).toBe(4);
    expect(migration).toContain("STABLE SECURITY DEFINER");
    for (const forbidden of ["INSERT INTO", "DELETE FROM", "UPDATE public.", "service_role_key"]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it("não tocam contatos privados, códigos de acesso ou schema private", () => {
    for (const forbidden of [
      "private.",
      "profile_contacts",
      "whatsapp",
      "phone",
      "email",
      "pin_code",
      "recovery",
      "hash_phone",
    ]) {
      expect(migration.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("nome e empresa aparecem apenas em amostras de investigação admin, sem contato", () => {
    const matcher = intelligenceMatcherSchema.parse({
      event_id: "sudoexpo-2026",
      generated_at: "2026-09-14T05:00:00Z",
      matches_active: 1,
      residuals: {
        total: 1,
        mutual: 0,
        with_connection: 0,
        with_strong_outcome: 0,
        sample: [
          {
            match_id: uuid(1),
            profile_id: uuid(2),
            profile_name: "Fulano",
            company: "Empresa",
            score: 21,
            kind: "hibrido",
            mutual: false,
            connection_status: null,
            strong_outcome: false,
          },
        ],
      },
    });
    for (const row of matcher.residuals.sample) expect(hasPrivateKey(row)).toBe(false);
  });

  it("a rota é admin-only e sempre passa o evento selecionado", () => {
    expect(routeSrc).toContain('createFileRoute("/admin_/inteligencia")');
    expect(routeSrc).toContain('roleQuery.data !== "admin"');
    expect(routeSrc).toContain("useAdminEvent()");
    expect(routeSrc).toContain("selectedEventId");
    expect(hookSrc).toContain("_event_id: eventId");
    expect(hookSrc).not.toContain("sudoexpo-2026");
    expect(hookSrc).not.toMatch(/EVENT_ID/);
  });
});

// ------------------------------------------------------------- regressões

describe("regressão de Reason Lift e matriz de score", () => {
  const matcher = intelligenceMatcherSchema.parse({
    event_id: "sudoexpo-2026",
    generated_at: "2026-09-14T05:00:00Z",
    matches_active: 100,
    score_matrix: [
      { bucket_a: "0-19", bucket_b: "75+", matches: 20, mutual: 1, connections: 3 },
      { bucket_a: "75+", bucket_b: "75+", matches: 40, mutual: 8, connections: 12 },
    ],
    reason_lift: [
      {
        code: "oferta_atende_necessidade",
        n_with: 100,
        interests_with: 70,
        n_without: 100,
        interests_without: 40,
        selective_n_with: 50,
        selective_interests_with: 30,
        selective_n_without: 50,
        selective_interests_without: 20,
      },
      {
        code: "mesma_cidade",
        n_with: 100,
        interests_with: 45,
        n_without: 100,
        interests_without: 50,
        selective_n_with: 5,
        selective_interests_with: 1,
        selective_n_without: 5,
        selective_interests_without: 3,
      },
    ],
    kinds: [
      {
        kind: "hibrido",
        matches: 60,
        decisions: 50,
        interests: 30,
        selective_decisions: 20,
        selective_interests: 10,
      },
    ],
    residuals: { total: 0, mutual: 0, with_connection: 0, with_strong_outcome: 0, sample: [] },
  });

  it("lift em pp, ordenação e N estáveis", () => {
    const rows = reasonLiftRows(matcher, "all");
    expect(rows[0].code).toBe("oferta_atende_necessidade");
    expect(rows[0].liftPp).toBe(30);
    expect(rows[0].withRate.denominator).toBe(100);
    expect(rows[1].liftPp).toBe(-5);
  });

  it("coorte seletiva com N baixo é sinalizada, não escondida", () => {
    const rows = reasonLiftRows(matcher, "selective");
    const city = rows.find((r) => r.code === "mesma_cidade");
    expect(city?.withRate.smallSample).toBe(true);
    expect(city?.liftPp).toBe(-40);
  });

  it("matriz mantém 25 células e intensidade relativa ao máximo", () => {
    const grid = scoreMatrix(matcher, "matches");
    expect(grid.cells).toHaveLength(25);
    expect(grid.max).toBe(40);
    const strong = grid.cells.find((c) => c.bucketA === "75+" && c.bucketB === "75+");
    expect(strong?.value).toBe(40);
    expect(strong?.intensity).toBe(1);
    const mutualGrid = scoreMatrix(matcher, "mutual");
    expect(mutualGrid.max).toBe(8);
  });

  it("kinds e histograma de propensão não inventam categorias", () => {
    expect(kindRows(matcher).map((k) => k.kind)).toEqual(["hibrido"]);
    const behavior = intelligenceBehaviorSchema.parse({
      event_id: "sudoexpo-2026",
      generated_at: "2026-09-14T05:00:00Z",
      participants_with_decision: 0,
      selective: 0,
      permissive_strong: 0,
      all_interest_small_sample: 0,
      decisions_total: 0,
    });
    const rows = propensityRows(behavior);
    expect(rows).toHaveLength(PROPENSITY_BUCKETS.length);
    expect(rows.every((r) => r.participants === 0)).toBe(true);
  });
});
