import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { wizardCreateSchema } from "@/features/onboarding/schemas";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const HERO = read("src/components/home/Hero.tsx");
const BENEFITS = read("src/components/home/BenefitCards.tsx");
const PROCESS = read("src/components/home/ProcessPanel.tsx");
const CTA = read("src/components/home/FinalCta.tsx");
const MATCH_CARD = read("src/features/participant/components/MatchCard.tsx");
const MATCH_QUERIES = read("src/features/matching/queries.ts");
const MATCH_API = read("src/features/matching/api.ts");

function psql(sql: string): string {
  return execSync(`psql -Atc ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Texto visível aproximado: literais dentro de JSX, fora de className/style. */
function visibleText(src: string): string {
  return src
    .replace(/className=\{?["'`][\s\S]*?["'`]\}?/g, " ")
    .replace(/style=\{\{[\s\S]*?\}\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

describe("Entrega A — landing com menos texto", () => {
  it("hero tem uma única frase curta de apoio", () => {
    expect(HERO).toContain(
      "Diga o que oferece e o que procura. O Matchmaker encontra as conexões mais relevantes",
    );
    expect(HERO).not.toContain("O Matchmaker analisa os perfis dos");
    expect(HERO).not.toContain("Quando houver interesse dos dois lados");
  });

  it("headline e CTAs do hero seguem intactos", () => {
    expect(HERO).toContain("Encontre");
    expect(HERO).toContain("dentro da SudoExpo.");
    expect(HERO).toContain('to="/participar"');
    expect(HERO).toContain("Criar meu perfil");
    expect(HERO).toContain('to="/participante"');
    expect(HERO).toContain("Ver minhas conexões");
    // ilustrações preservadas
    expect(HERO).toContain("<HeroVisual />");
    expect(HERO).toContain("<HeroVisualMobile />");
  });

  it("benefícios ficam em título + frase curta (<= 60 caracteres)", () => {
    const bodies = [...BENEFITS.matchAll(/body: "([^"]+)"/g)].map((m) => m[1]);
    expect(bodies).toHaveLength(3);
    for (const b of bodies) {
      expect(b.length).toBeLessThanOrEqual(60);
      expect(b.split(". ").length).toBeLessThanOrEqual(1);
    }
  });

  it("processo mantém as 4 etapas com rótulos curtos e sem subtítulo redundante", () => {
    const stepsBlock = PROCESS.slice(PROCESS.indexOf("const STEPS"), PROCESS.indexOf("const AUDIENCE"));
    const labels = [...stepsBlock.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(4);
    for (const l of labels) expect(l.length).toBeLessThanOrEqual(28);
    expect(PROCESS).not.toContain("Conexões profissionais em quatro etapas");
    expect(PROCESS).toContain("Como funciona");
    expect(PROCESS).toContain('to="/publico"');
  });

  it("CTA final é direto e mantém o link para o painel do participante", () => {
    expect(CTA).toContain("Já criou seu perfil?");
    expect(CTA).toContain("Veja quem tem interesse em você.");
    expect(CTA).not.toContain("Acesse suas conexões, veja quem demonstrou interesse e responda.");
    expect(CTA).toContain('to="/participante"');
    expect(CTA).toContain("Acessar minhas conexões");
  });

  it("a mesma explicação não se repete entre hero, benefícios e processo", () => {
    const analisa = [HERO, BENEFITS, PROCESS, CTA].filter((s) =>
      visibleText(s).includes("analisa os perfis"),
    );
    expect(analisa).toHaveLength(0);
    const cruza = [HERO, BENEFITS, PROCESS].filter((s) => /cruza as informações/.test(s));
    expect(cruza.length).toBeLessThanOrEqual(1);
  });

  it("volume de texto visível da landing cai para um patamar enxuto", () => {
    const chars = [HERO, BENEFITS, PROCESS, CTA]
      .map((s) => visibleText(s).length)
      .reduce((a, b) => a + b, 0);
    expect(chars).toBeLessThan(4200);
  });

  it("layout responsivo preservado (sem largura fixa que estoure em 320px)", () => {
    for (const src of [HERO, BENEFITS, PROCESS, CTA]) {
      // largura fixa só é aceitável em enfeite absoluto/escondido no mobile
      const fixed = [...src.matchAll(/className="([^"]*(?<![-\w])w-\[\d{3,}px\][^"]*)"/g)].map(
        (m) => m[1],
      );
      for (const cls of fixed) {
        expect(cls).toMatch(/absolute|hidden/);
      }
      expect(src).not.toMatch(/overflow-x-scroll/);
    }
    expect(HERO).toContain("md:grid-cols-");
    expect(BENEFITS).toContain("sm:grid-cols-2");
    expect(PROCESS).toContain("lg:grid-cols-");
    expect(CTA).toContain("md:flex-row");
  });
});

describe("Entrega B — múltiplos interesses (auditoria: já suportado)", () => {
  it("cadastro aceita várias ofertas e várias necessidades", () => {
    const base = {
      step: 4,
      name: "Ana Souza",
      company: "Padaria Sol",
      city: "Rio Verde",
      neighborhood: "",
      businessSize: "pequeno" as const,
      businessType: "comercio" as const,
      segmentId: "alimentacao",
      niche: "",
      summary: "Padaria artesanal com produção própria de pães e doces para eventos.",
      instagram: "",
      consent: true as const,
      offers: [1, 2, 3].map((i) => ({
        localId: `o${i}`,
        label: `Oferta ${i}`,
        segmentId: "alimentacao",
        taxonomyItemId: null,
      })),
      needs: [1, 2, 3].map((i) => ({
        localId: `n${i}`,
        label: `Necessidade ${i}`,
        segmentId: "alimentacao",
        taxonomyItemId: null,
        needKind: "produtos" as const,
        isPriority: i === 1,
      })),
    };
    const parsed = wizardCreateSchema.safeParse(base);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    expect(parsed.success && parsed.data.offers).toHaveLength(3);
    expect(parsed.success && parsed.data.needs).toHaveLength(3);
  });

  it("porte, tipo e segmento continuam classificadores únicos (não viram multiselect)", () => {
    const SCHEMAS = read("src/features/onboarding/schemas.ts");
    expect(SCHEMAS).toMatch(/businessSize:\s*businessSizeSchema/);
    expect(SCHEMAS).toMatch(/businessType:\s*businessTypeSchema/);
    expect(SCHEMAS).not.toMatch(/businessSize:\s*z\.array/);
    expect(SCHEMAS).not.toMatch(/businessType:\s*z\.array/);
    expect(SCHEMAS).not.toMatch(/segmentId:\s*z\.array/);
  });

  it("a decisão é por match: cada card tem sua própria mutation e envia só o match_id", () => {
    expect(MATCH_CARD).toContain("useDecideMatchMutation(eventId)");
    expect(MATCH_CARD).toContain("matchId: match.match_id");
    // nada de seleção única global (um match escolhido por vez)
    expect(MATCH_CARD).not.toMatch(/selectedMatch|activeMatch|onlyOne|singleSelect/i);
    expect(MATCH_API).toContain("_match_id: matchId");
  });

  it("decidir um match apenas revalida a lista — não limpa decisões de outros", () => {
    expect(MATCH_QUERIES).toContain("invalidateQueries");
    expect(MATCH_QUERIES).not.toMatch(/setQueryData[\s\S]{0,200}decision:\s*"sem_decisao"/);
    expect(MATCH_QUERIES).not.toMatch(/qc\.clear\(\)|removeQueries/);
  });

  it("botões ficam desabilitados apenas pela decisão do próprio card", () => {
    expect(MATCH_CARD).toContain('disabled={myDecision === "interesse" || decide.isPending}');
    expect(MATCH_CARD).toContain('disabled={myDecision === "agora_nao" || decide.isPending}');
  });

  it("banco guarda uma decisão por (match, perfil) — sem exclusividade entre matches", () => {
    expect(
      psql(`SELECT count(*)::int FROM pg_indexes
             WHERE tablename='match_decisions'
               AND indexdef ILIKE '%UNIQUE%(match_id, profile_id)%'`),
    ).toBe("1");
    // nenhuma unicidade por perfil isolado (que forçaria 1 interesse no total)
    expect(
      psql(`SELECT count(*)::int FROM pg_indexes
             WHERE tablename='match_decisions'
               AND indexdef ILIKE '%UNIQUE%'
               AND indexdef ILIKE '%(profile_id)%'
               AND indexdef NOT ILIKE '%match_id%'`),
    ).toBe("0");
  });

  it("a RPC de decisão só toca no match informado (nenhum reset em massa)", () => {
    const src = psql(
      `SELECT prosrc FROM pg_proc WHERE oid='public.record_match_decision_v2(uuid,public.decision)'::regprocedure`,
    );
    expect(src).toContain("ON CONFLICT (match_id, profile_id) DO UPDATE");
    expect(src).not.toMatch(/DELETE FROM public\.match_decisions/i);
    expect(src).not.toMatch(/UPDATE public\.match_decisions[\s\S]{0,120}WHERE profile_id\s*=/i);
  });

  it("interesse simultâneo em vários matches é o estado esperado dos dados", () => {
    // qualquer perfil pode ter N decisões 'interesse' — nenhuma trava no schema
    const perfilComMaisDeUma = psql(
      `SELECT count(*)::int FROM (
         SELECT profile_id FROM public.match_decisions
          WHERE decision = 'interesse'
          GROUP BY profile_id HAVING count(*) > 1
       ) t`,
    );
    expect(Number(perfilComMaisDeUma)).toBeGreaterThanOrEqual(0);
    expect(
      psql(`SELECT count(*)::int FROM pg_constraint
             WHERE conrelid='public.match_decisions'::regclass AND contype='c'
               AND pg_get_constraintdef(oid) ILIKE '%profile_id%'`),
    ).toBe("0");
  });
});
