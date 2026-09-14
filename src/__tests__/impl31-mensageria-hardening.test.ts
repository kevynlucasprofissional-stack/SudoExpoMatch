import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  compareMatchesForRanking,
  resolveTopThreeMatchIds,
  sortMatchesByMutualInterest,
} from "@/features/participant/presentation";
import {
  adaptApproachForWhatsApp,
  buildParticipantIcebreaker,
  buildParticipantWhatsAppLink,
} from "@/features/participant/icebreaker";
import { generateMatchAiSummary } from "@/features/participant/matchAiSummary";
import {
  generateParticipantReactivationMessage,
  hasOutreachContext,
  participantOutreachContextSchema,
  resolveOtherSuggestionsCount,
} from "@/features/admin/participantOutreach";
import { hasPrivateKey } from "@/features/admin/participantsSchemas";
import { MATCH_BRIEFING_PROMPT_VERSION } from "@/lib/match-briefing";
import type { OwnMatchDTO } from "@/features/participant/types";

/**
 * IMPL 31 — HARDENING / SOURCE CONTRACT.
 *
 * Auditoria externa do commit inicial da IMPL 31 encontrou dois achados
 * concretos: (1) o participante podia executar as RPCs internas de
 * dossier/save e sobrescrever o briefing oficial; (2) o Top 3 do banco não era
 * o Top 3 realmente exibido. Esta suíte trava o contrato corrigido — parte por
 * leitura da migration/código-fonte, parte por helpers puros.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIGRATIONS_DIR = "supabase/migrations";
const hardeningMigration = (() => {
  const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const found = files
    .map((f) => ({ f, sql: read(join(MIGRATIONS_DIR, f)) }))
    .filter((x) => x.sql.includes("service_participant_briefing_context"));
  expect(found.length).toBeGreaterThan(0);
  return found[found.length - 1].sql;
})();

// ---------------------------------------------------------------------------
// Achado 1 — participante NÃO pode escrever em match_briefings
// ---------------------------------------------------------------------------

describe("IMPL 31 hardening — RPCs internas fechadas ao cliente", () => {
  const internals = [
    "public.participant_get_match_dossier(uuid)",
    "public.participant_save_match_briefing(uuid, jsonb)",
    "public._participant_match_rank(uuid, uuid)",
  ];

  it("revoga EXECUTE de PUBLIC, anon e authenticated nas RPCs internas", () => {
    for (const fn of internals) {
      expect(hardeningMigration).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`);
      expect(hardeningMigration).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM anon;`);
      expect(hardeningMigration).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM authenticated;`);
    }
  });

  it("mantém as RPCs internas acessíveis apenas ao service_role", () => {
    for (const fn of internals) {
      expect(hardeningMigration).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`);
      expect(hardeningMigration).not.toContain(
        `GRANT EXECUTE ON FUNCTION ${fn} TO authenticated`,
      );
    }
  });

  it("cria pontes server-only com ator explícito, sem grant para authenticated", () => {
    for (const bridge of [
      "public.service_participant_briefing_context(uuid, uuid)",
      "public.service_participant_save_briefing(uuid, uuid, jsonb)",
    ]) {
      expect(hardeningMigration).toContain(`REVOKE ALL ON FUNCTION ${bridge} FROM authenticated;`);
      expect(hardeningMigration).toContain(`REVOKE ALL ON FUNCTION ${bridge} FROM anon;`);
      expect(hardeningMigration).toContain(`REVOKE ALL ON FUNCTION ${bridge} FROM PUBLIC;`);
      expect(hardeningMigration).toContain(`GRANT EXECUTE ON FUNCTION ${bridge} TO service_role;`);
    }
    expect(hardeningMigration).toContain("_actor_user_id uuid");
  });

  it("as pontes revalidam ownership, match ativo, evento e Top 3", () => {
    const relevant = ["service_participant_briefing_context", "service_participant_save_briefing"].map(
      (name) => {
        const start = hardeningMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
        expect(start).toBeGreaterThan(-1);
        const end = hardeningMigration.indexOf("REVOKE ALL ON FUNCTION", start);
        return hardeningMigration.slice(start, end);
      },
    );
    for (const body of relevant) {
      expect(body).toContain("match_inactive");
      expect(body).toContain("not_a_participant");
      expect(body).toContain("not_top_three");
      expect(body).toContain("p.event_id = v_m.event_id");
      expect(body).toContain("p.is_demo = false");
    }
  });

  it("a server function do participante usa a ponte service-role, nunca a RPC antiga", () => {
    const src = read("src/lib/participant-briefing.functions.ts");
    expect(src).toContain("service_participant_briefing_context");
    expect(src).toContain("service_participant_save_briefing");
    expect(src).not.toContain('"participant_get_match_dossier"');
    expect(src).not.toContain('"participant_save_match_briefing"');
    expect(src).toContain("client.server");
    // Nenhum segredo/service role no cliente: o import é dinâmico e server-only.
    expect(src).toContain('await import("@/integrations/supabase/client.server")');
  });

  it("o cliente do participante nunca chama dossier/save diretamente", () => {
    for (const f of [
      "src/features/participant/useOwnMatchBriefing.ts",
      "src/features/participant/components/MatchCard.tsx",
      "src/features/participant/api.ts",
    ]) {
      const src = read(f);
      expect(src).not.toContain("participant_get_match_dossier");
      expect(src).not.toContain("participant_save_match_briefing");
    }
  });
});

// ---------------------------------------------------------------------------
// Achado 2 — Top 3 do backend == Top 3 exibido
// ---------------------------------------------------------------------------

function m(over: Partial<OwnMatchDTO> & { match_id: string }): OwnMatchDTO {
  return {
    my_decision: "sem_decisao",
    other_decision: "sem_decisao",
    score_me: 0,
    score_other: 0,
    other: { name: "X", company: "X", segment_id: "s" },
    reasons: [],
    other_offers: [],
    other_needs: [],
    briefing: null,
    ...over,
  } as unknown as OwnMatchDTO;
}

/** Chave de ordenação EXATA do `ORDER BY` de `public._participant_match_rank`. */
function sqlOrderKey(x: OwnMatchDTO): Array<number | string> {
  const me = x.score_me ?? 0;
  const other = x.score_other ?? 0;
  const gap = Math.abs(me - other);
  const tier = me >= 60 && other >= 60 ? (gap < 30 ? 1 : 2) : 3;
  return [
    x.my_decision === "agora_nao" ? 1 : 0,
    tier,
    tier < 3 ? gap : 0,
    tier < 3 ? -(me + other) : 0,
    tier < 3 ? -me : 0,
    tier === 3 ? -me : 0,
    tier === 3 ? -other : 0,
    x.match_id,
  ];
}

function bySqlKey(a: OwnMatchDTO, b: OwnMatchDTO): number {
  const ka = sqlOrderKey(a);
  const kb = sqlOrderKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] === kb[i]) continue;
    if (typeof ka[i] === "string" || typeof kb[i] === "string") {
      return String(ka[i]) < String(kb[i]) ? -1 : 1;
    }
    return (ka[i] as number) - (kb[i] as number);
  }
  return 0;
}

const fixtures: OwnMatchDTO[] = [
  m({ match_id: "a1", score_me: 90, score_other: 80 }), // tier 1, gap 10
  m({ match_id: "a2", score_me: 70, score_other: 65 }), // tier 1, gap 5
  m({ match_id: "a3", score_me: 100, score_other: 61 }), // tier 2, gap 39
  m({ match_id: "a4", score_me: 120, score_other: 20 }), // tier 3
  m({ match_id: "a5", score_me: 120, score_other: 40 }), // tier 3, mesma me
  m({ match_id: "a6", score_me: 95, score_other: 85, my_decision: "agora_nao" }), // final
  m({ match_id: "a7", score_me: 70, score_other: 65 }), // empate total com a2 → id
  m({ match_id: "a0", score_me: 70, score_other: 65 }), // empate total → id menor
  m({ match_id: "b1", score_me: 30, score_other: 30 }), // tier 3 baixo
];

describe("IMPL 31 hardening — Top 3 canônico", () => {
  it("a ordenação da UI é equivalente ao ORDER BY do rank no banco", () => {
    const ui = [...fixtures].sort(compareMatchesForRanking).map((x) => x.match_id);
    const sql = [...fixtures].sort(bySqlKey).map((x) => x.match_id);
    expect(ui).toEqual(sql);
  });

  it("é estável para qualquer ordem de entrada (desempate final por match_id)", () => {
    const base = [...fixtures].sort(compareMatchesForRanking).map((x) => x.match_id);
    const shuffled = [...fixtures].reverse();
    expect([...shuffled].sort(compareMatchesForRanking).map((x) => x.match_id)).toEqual(base);
    expect(sortMatchesByMutualInterest(shuffled).map((x) => x.match_id)).toEqual(base);
  });

  it("coloca agora_nao no final mesmo com score alto", () => {
    const order = sortMatchesByMutualInterest(fixtures).map((x) => x.match_id);
    expect(order[order.length - 1]).toBe("a6");
  });

  it("a migration reproduz tiers, gap, soma e desempate por id", () => {
    const rank = hardeningMigration.slice(
      hardeningMigration.indexOf("_participant_match_rank(_match_id uuid, _profile_id uuid)"),
    );
    expect(rank).toContain("dismissed ASC");
    expect(rank).toContain("tier ASC");
    expect(rank).toContain("(CASE WHEN tier < 3 THEN gap ELSE 0 END) ASC");
    expect(rank).toContain("(CASE WHEN tier < 3 THEN -(score_me + score_other) ELSE 0 END) ASC");
    expect(rank).toContain("(CASE WHEN tier = 3 THEN -score_other ELSE 0 END) ASC");
    expect(rank).toContain("id ASC");
    expect(rank).toContain("abs(score_me - score_other) < 30");
  });

  it("Top 3 GLOBAL não muda quando a lista é filtrada por Interesses", () => {
    const top = resolveTopThreeMatchIds(fixtures);
    expect([...top]).toEqual(["a0", "a2", "a7"]);

    // Aba "Interesses": subconjunto arbitrário — os 3 primeiros dela NÃO são Top 3.
    const interesses = fixtures.filter((x) => ["a4", "a5", "b1"].includes(x.match_id));
    const primeirosDoFiltro = sortMatchesByMutualInterest(interesses)
      .slice(0, 3)
      .map((x) => x.match_id);
    for (const id of primeirosDoFiltro) expect(top.has(id)).toBe(false);
  });

  it("a lista marca Top 3 por match_id global, nunca por índice", () => {
    const list = read("src/features/participant/components/MatchesList.tsx");
    expect(list).toContain("topThreeMatchIds?.has(m.match_id)");
    expect(list).not.toContain("index < 3");

    const route = read("src/routes/participante.tsx");
    expect(route).toContain("resolveTopThreeMatchIds");
    // Ambas as abas recebem o MESMO conjunto global.
    expect(route.match(/topThreeMatchIds=\{topThreeMatchIds\}/g)?.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rate limit, reuso e custo
// ---------------------------------------------------------------------------

describe("IMPL 31 hardening — custo e rate limit", () => {
  const src = read("src/lib/participant-briefing.functions.ts");

  it("autoriza ANTES de consumir a quota", () => {
    const authAt = src.indexOf("service_participant_briefing_context");
    const rateAt = src.indexOf("ai_rate_limit_consume");
    expect(authAt).toBeGreaterThan(-1);
    expect(rateAt).toBeGreaterThan(authAt);
  });

  it("o rate limiter é FAIL CLOSED", () => {
    expect(src).toContain('if (limit.error) throw new Error("ai_unavailable")');
    expect(src).toContain('if (limit.data === false) throw new Error("ai_rate_limited")');
  });

  it("reutiliza briefing oficial atual sem chamar o modelo", () => {
    const reuseAt = src.indexOf("stale === false");
    const modelAt = src.indexOf("generateText(");
    expect(reuseAt).toBeGreaterThan(-1);
    expect(reuseAt).toBeLessThan(modelAt);
    expect(src).toContain("reused: true");
  });

  it("a ponte devolve o briefing existente com marca de stale", () => {
    expect(hardeningMigration).toContain("'existing', v_existing");
    expect(hardeningMigration).toContain("_match_inputs_fingerprint");
  });

  it("a mutação invalida a lista de sugestões do participante", () => {
    const hook = read("src/features/participant/useOwnMatchBriefing.ts");
    expect(hook).toContain("qk.ownMatches(eventId)");
  });
});

// ---------------------------------------------------------------------------
// Mensagem participant-centric
// ---------------------------------------------------------------------------

function ctx(over: Record<string, unknown> = {}) {
  return participantOutreachContextSchema.parse({
    profile_id: "11111111-1111-1111-1111-111111111111",
    event_id: "sudoexpo-2026",
    name: "Bruna Silva",
    company: "Silva Modas",
    phone_e164: "+5564992470988",
    active_matches_count: 0,
    incoming_interests: [],
    released_connections: [],
    ...over,
  });
}

const p = (n: number, name: string, company?: string | null) => ({
  match_id: `2222222${n}-2222-2222-2222-222222222222`,
  profile_id: `3333333${n}-3333-3333-3333-333333333333`,
  name,
  company: company ?? null,
});

describe("IMPL 31 hardening — mensagem em parágrafos e honesta", () => {
  it("usa parágrafos separados por linha em branco", () => {
    const msg = generateParticipantReactivationMessage(
      ctx({ active_matches_count: 3, incoming_interests: [p(1, "Ana")] }),
    );
    expect(msg).toContain("\n\n");
    expect(msg.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });

  it("sem nenhum contexto entrega só a saudação e nenhuma promessa futura", () => {
    const c = ctx({ active_matches_count: 0 });
    expect(hasOutreachContext(c)).toBe(false);
    const msg = generateParticipantReactivationMessage(c);
    expect(msg).toBe("Olá, Bruna, tudo bem? Aqui é o Kevyn, da comunicação da ACIRV.");
    expect(msg).not.toMatch(/aviso|surgirem|em breve/i);
  });

  it("usa other_suggestions_count exato do backend quando presente", () => {
    const c = ctx({
      active_matches_count: 9,
      other_suggestions_count: 0,
      incoming_interests: [p(1, "Ana")],
    });
    expect(resolveOtherSuggestionsCount(c, 1, 0)).toBe(0);
    expect(generateParticipantReactivationMessage(c)).not.toContain(
      "outras sugestões de conexão esperando",
    );
  });

  it("nunca subtrai conexão inativa: sem o campo exato, cai no cálculo conservador", () => {
    const c = ctx({ active_matches_count: 4, incoming_interests: [p(1, "Ana")] });
    expect(resolveOtherSuggestionsCount(c, 1, 0)).toBe(3);
    expect(generateParticipantReactivationMessage(c)).toContain(
      "outras sugestões de conexão esperando",
    );
  });

  it("preserva o interesse da contraparte mesmo com conexão já liberada", () => {
    const msg = generateParticipantReactivationMessage(
      ctx({
        active_matches_count: 1,
        incoming_interests: [p(1, "Ana", "Ana Doces")],
        released_connections: [
          {
            ...p(1, "Ana", "Ana Doces"),
            status: "apresentados",
            my_decision: "sem_decisao",
            other_decision: "interesse",
            other_has_interest: true,
          },
        ],
      }),
    );
    expect(msg).toMatch(/Ana, da Ana Doces demonstrou interesse em conversar com você/);
    expect(msg).toContain("conexão já está liberada");
    // Não duplica a mesma pessoa em dois blocos de interesse.
    expect(msg.match(/demonstrou interesse/g)?.length).toBe(1);
  });

  it("a contagem exata vem do backend e o contexto é admin-only e event-scoped", () => {
    expect(hardeningMigration).toContain("'other_suggestions_count', v_other_count");
    expect(hardeningMigration).toContain("_admin_require_event_admin(v_p.event_id)");
    expect(hardeningMigration).toContain("'other_has_interest'");
  });

  it("nunca inclui telefone de ninguém na mensagem", () => {
    const msg = generateParticipantReactivationMessage(
      ctx({ active_matches_count: 2, incoming_interests: [p(1, "Ana")] }),
    );
    expect(msg).not.toMatch(/\+55|992470988/);
  });
});

// ---------------------------------------------------------------------------
// Privacidade no admin
// ---------------------------------------------------------------------------

describe("IMPL 31 hardening — privacidade no painel", () => {
  it("listagem e detalhe do participante continuam sem contato", () => {
    expect(
      hasPrivateKey({ participant: { name: "Ana", city: "Rio Verde" }, matches: [] }),
    ).toBe(false);
    expect(hasPrivateKey({ participant: { phone_e164: "+55" } })).toBe(true);
  });

  it("o telefone só existe no contexto sob demanda, com cache zero", () => {
    const hook = read("src/features/admin/useParticipantOutreach.ts");
    expect(hook).toContain("gcTime: 0");
    expect(hook).toContain("staleTime: 0");
    const list = read("src/routes/admin_.participantes.tsx");
    expect(list).not.toContain("phone_e164");
  });

  it("o botão do card não abre a ficha por engano", () => {
    const list = read("src/routes/admin_.participantes.tsx");
    const btn = list.slice(list.indexOf("btn-participant-outreach") - 900);
    expect(btn).toContain("stopPropagation()");
  });

  it("o log de abordagem não grava telefone", () => {
    expect(hardeningMigration).not.toContain("'phone', v_phone");
    const hook = read("src/features/admin/useParticipantOutreach.ts");
    expect(hook).toContain("_message_preview");
    expect(hook).not.toContain("phone");
  });
});

// ---------------------------------------------------------------------------
// Reveal + quebra-gelo + fallback determinístico
// ---------------------------------------------------------------------------

describe("IMPL 31 hardening — reveal e quebra-gelo", () => {
  it("o contato do reveal continua efêmero e o texto vai por ?text=", () => {
    const queries = read("src/features/matching/queries.ts");
    expect(queries).toContain("gcTime: 0");
    const dialog = read("src/features/participant/components/RevealContactDialog.tsx");
    expect(dialog).toContain("mutation.reset()");
    expect(dialog).toContain("buildParticipantWhatsAppLink(contact.phone_e164, message)");
    expect(buildParticipantWhatsAppLink("+55 64 99247-0988", "Oi!")).toBe(
      "https://wa.me/5564992470988?text=Oi!",
    );
    expect(buildParticipantWhatsAppLink("+5564992470988", "  ")).toBe(
      "https://wa.me/5564992470988",
    );
  });

  it("o fallback determinístico não carrega rótulo nem flag de IA", () => {
    const summary = generateMatchAiSummary(
      m({ match_id: "z1", other: { name: "Carlos", company: "Souza", segment_id: "textil" } } as never),
    );
    expect(Object.keys(summary).sort()).toEqual(["what_you_gain", "why_connect"]);
    expect("is_ai_enhanced" in summary).toBe(false);

    const src = read("src/features/participant/matchAiSummary.ts");
    expect(src).not.toContain("is_ai_enhanced");
    expect(src).not.toMatch(/síntese determinística de IA/i);
    expect(src).toContain("SÍNTESE DETERMINÍSTICA (não é IA)");

    const card = read("src/features/participant/components/MatchCard.tsx");
    expect(card).toContain("Resumo da oportunidade");
    // Briefing oficial vence: só ele carrega o rótulo de IA.
    expect(card).toContain("Leitura detalhada com IA");
    expect(card).toContain("match.briefing ?? null");
  });

  it("approach em discurso direto alimenta o WhatsApp", () => {
    expect(adaptApproachForWhatsApp("Vi que vocês trabalham com tecidos, que é o que eu procuro.")).toBe(
      "Vi que vocês trabalham com tecidos, que é o que eu procuro.",
    );
    const ice = buildParticipantIcebreaker(
      m({
        match_id: "z2",
        briefing: {
          summary: "s",
          my_side: [],
          evidence: [],
          approach: "Vi que vocês trabalham com tecidos.",
          generated_at: "2026-09-14T00:00:00Z",
          stale: false,
        },
      } as never),
    );
    expect(ice.source).toBe("briefing_approach");
    expect(ice.text).toContain("Vi que vocês trabalham com tecidos.");
  });

  it("approach META de briefings antigos é limpo ou descartado", () => {
    expect(adaptApproachForWhatsApp("Ao falar com Carlos, pergunte sobre a capacidade dele.")).toBeNull();
    expect(adaptApproachForWhatsApp("Pergunte se ele atende pedidos pequenos.")).toBeNull();
    expect(adaptApproachForWhatsApp("A equipe pode apresentar os dois pelo interesse em tecidos.")).toBeNull();
    expect(adaptApproachForWhatsApp("Diga que você procura fornecedor de tecidos.")).toBe(
      "Você procura fornecedor de tecidos.",
    );

    // Sem approach utilizável, o quebra-gelo cai no determinístico.
    const ice = buildParticipantIcebreaker(
      m({
        match_id: "z3",
        other_offers: [{ label: "tecidos" }],
        reasons: [{ code: "outro_oferece_o_que_procuro", label: "L", weight: 55 }],
        briefing: {
          summary: "s",
          my_side: [],
          evidence: [],
          approach: "Ao apresentar os dois, destaque a sinergia.",
          generated_at: "2026-09-14T00:00:00Z",
          stale: false,
        },
      } as never),
    );
    expect(ice.source).toBe("deterministic");
    expect(ice.text).not.toMatch(/apresentar os dois|destaque/i);
  });

  it("sem approach e sem sinais, o quebra-gelo é mínimo e natural", () => {
    const ice = buildParticipantIcebreaker(m({ match_id: "z4" }));
    expect(ice.source).toBe("minimal");
    expect(ice.text).toMatch(/Topa marcar um café/);
    expect(adaptApproachForWhatsApp(null)).toBeNull();
    expect(adaptApproachForWhatsApp("   ")).toBeNull();
  });

  it("o prompt do briefing pede discurso direto e a versão foi incrementada", () => {
    const prompt = read("src/lib/match-briefing.ts");
    expect(prompt).toContain("DISCURSO DIRETO");
    expect(prompt).toMatch(/PROIBIDO usar instruções meta/);
    expect(MATCH_BRIEFING_PROMPT_VERSION).toBe("briefing-v2");
  });
});
