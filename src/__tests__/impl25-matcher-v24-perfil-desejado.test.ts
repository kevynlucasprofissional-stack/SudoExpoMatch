import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Profile } from "@/lib/types";
import {
  WEIGHTS,
  targetFit,
  targetFitLabel,
  classifyKind,
  scorePerspective,
} from "@/testing/matching-spec";

/**
 * Implementação 25 — Matcher v2.4: "quem eu procuro × quem o outro é" como
 * sinal de match de primeira classe.
 *
 * A prova COMPORTAMENTAL roda como migration transacional (PROVA v2.4): cria
 * evento/perfis temporários, valida cada cenário com RAISE EXCEPTION e apaga
 * tudo ao final. Aqui validamos a definição instalada no banco e o espelho de
 * lógica usado pela suíte.
 */

function psql(sql: string): string {
  return execSync(`psql -Atc ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fnDef(name: string): string {
  return psql(`
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='${name}'
     LIMIT 1
  `);
}

const def = fnDef("_recompute_matches_for_profile");
const MIG_DIR = "supabase/migrations";
const migrations = readdirSync(MIG_DIR)
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"));
const proof = migrations.find((sql) => sql.includes("PROVA v2.4"));

describe("v2.4 — definição instalada no banco", () => {
  it("eleva algorithm_version para v2.4", () => {
    expect(def).toContain("v_algo text := 'v2.4'");
  });

  it("preserva os pesos comerciais literais do v2.3", () => {
    for (const [code, w] of [
      ["outro_oferece_o_que_procuro", 55],
      ["outro_procura_o_que_ofereco", 25],
      ["prioridade", 10],
      ["complementaridade", 5],
      ["atualidade", 3],
      ["proximidade", 2],
    ] as const) {
      expect(def).toContain(String(w));
      expect(def).toContain(code);
    }
  });

  it("lê os campos de 'quem eu procuro' e de 'quem eu sou'", () => {
    for (const col of [
      "target_business_size",
      "target_business_type",
      "target_segment_id",
      "business_size",
      "business_type",
    ]) {
      expect(def).toContain(col);
    }
  });

  it("expõe as reasons perfil_desejado e perfil_desejado_mutuo", () => {
    expect(def).toContain("perfil_desejado");
    expect(def).toContain("perfil_desejado_mutuo");
  });

  it("usa full target fit como sinal de criação da dupla e kind perfil_desejado", () => {
    expect(def).toContain("full");
    expect(def).toContain("'perfil_desejado'");
  });

  it("mantém as funções auxiliares de target fit instaladas", () => {
    expect(fnDef("_target_fit")).toContain("specified_count");
    expect(fnDef("_target_fit")).toContain("matched_count");
    expect(fnDef("_target_fit_label")).toContain("procura");
  });

  it("documenta a fórmula do v2.4 no COMMENT", () => {
    const comment = psql(`
      SELECT obj_description(p.oid, 'pg_proc') FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='_recompute_matches_for_profile'
    `);
    expect(comment).toContain("v2.4");
    expect(comment).toContain("10 + 10*specified_count");
    expect(comment).toContain("Qualquer");
  });

  it("registra 'perfil_desejado' no enum match_kind (migration aditiva)", () => {
    const labels = psql(`
      SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='match_kind'
    `);
    expect(labels.split(",")).toContain("perfil_desejado");
    expect(labels.split(",")).toEqual(
      expect.arrayContaining(["direto", "inverso", "bidirecional", "complementar", "hibrido"]),
    );
  });
});

describe("v2.4 — prova transacional", () => {
  it("existe migration de prova com os cenários do target fit", () => {
    expect(proof).toBeTruthy();
    const sql = proof as string;
    for (const marker of ["cenario", "regressao", "PROVA v2.4 FALHOU"]) {
      expect(sql).toContain(marker);
    }
  });

  it("a prova limpa os dados temporários", () => {
    expect(proof as string).toContain("DELETE FROM public.events WHERE id");
  });
});

// --- espelho de lógica -------------------------------------------------------

const base: Profile = {
  id: "a",
  eventId: "e",
  name: "A",
  company: "A",
  city: "Cidade",
  whatsapp: "1",
  segmentId: "seg-a",
  summary: "",
  offers: [],
  needs: [],
  consent: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  recoveryCode: "x",
};

const other = (over: Partial<Profile>): Profile => ({ ...base, id: "b", ...over });

describe("v2.4 — targetFit (espelho)", () => {
  it("3 critérios especificados e atendidos => 40 pts", () => {
    const me = { ...base, targetBusinessSize: "pequeno", targetBusinessType: "servico", targetSegmentId: "seg-b" };
    const fit = targetFit(me, other({ businessSize: "pequeno", businessType: "servico", segmentId: "seg-b" }));
    expect(fit.full).toBe(true);
    expect(fit.specifiedCount).toBe(3);
    expect(fit.points).toBe(40);
  });

  it("2 critérios => 30 pts e 1 critério => 20 pts", () => {
    const two = targetFit(
      { ...base, targetBusinessSize: "pequeno", targetSegmentId: "seg-b" },
      other({ businessSize: "pequeno", segmentId: "seg-b" }),
    );
    expect(two.points).toBe(30);
    const one = targetFit({ ...base, targetSegmentId: "seg-b" }, other({ segmentId: "seg-b" }));
    expect(one.points).toBe(20);
  });

  it("fit parcial não pontua", () => {
    const fit = targetFit(
      { ...base, targetBusinessSize: "pequeno", targetSegmentId: "seg-b" },
      other({ businessSize: "grande", segmentId: "seg-b" }),
    );
    expect(fit.full).toBe(false);
    expect(fit.points).toBe(0);
  });

  it("'Qualquer' (null) é ignorado, nunca é hard gate", () => {
    const fit = targetFit(
      { ...base, targetBusinessSize: null, targetBusinessType: null, targetSegmentId: "seg-b" },
      other({ businessSize: "grande", businessType: "industria", segmentId: "seg-b" }),
    );
    expect(fit.specifiedCount).toBe(1);
    expect(fit.full).toBe(true);
  });

  it("nenhum critério especificado => sem sinal de target", () => {
    const fit = targetFit(base, other({ businessSize: "pequeno" }));
    expect(fit.specifiedCount).toBe(0);
    expect(fit.full).toBe(false);
    expect(fit.points).toBe(0);
  });

  it("gera rótulo compreensível sem IDs técnicos", () => {
    const fit = targetFit(
      { ...base, targetBusinessSize: "pequeno", targetSegmentId: "seg-b" },
      other({ businessSize: "pequeno", segmentId: "seg-b" }),
    );
    const label = targetFitLabel(fit);
    expect(label).toContain("porte");
    expect(label).toContain("segmento");
    expect(label).not.toContain("seg-b");
  });
});

describe("v2.4 — score e kind (espelho)", () => {
  const me = {
    ...base,
    targetBusinessSize: "pequeno",
    targetBusinessType: "servico",
    targetSegmentId: "seg-b",
  };
  const fitOther = other({
    segmentId: "seg-b",
    businessSize: "pequeno",
    businessType: "servico",
    targetSegmentId: "seg-a",
  });

  it("mútuo soma +10 por perspectiva, sem double count", () => {
    const r = scorePerspective(me, fitOther);
    const codes = r.reasons.map((x) => x.code);
    expect(codes.filter((c) => c === "perfil_desejado")).toHaveLength(1);
    expect(codes.filter((c) => c === "perfil_desejado_mutuo")).toHaveLength(1);
    // 40 (target fit completo) + 10 (mútuo) + sinais ambientais atualidade/proximidade.
    const ambient = r.reasons
      .filter((x) => x.code === "atualidade" || x.code === "proximidade")
      .reduce((acc, x) => acc + x.weight, 0);
    expect(r.total).toBe(40 + WEIGHTS.targetMutual + ambient);
  });

  it("assimétrico pontua só de um lado", () => {
    const oneWay = other({ segmentId: "seg-b", businessSize: "pequeno", businessType: "servico" });
    const mine = scorePerspective(me, oneWay);
    const theirs = scorePerspective(oneWay, me);
    expect(mine.reasons.map((r) => r.code)).toContain("perfil_desejado");
    expect(theirs.reasons.map((r) => r.code)).not.toContain("perfil_desejado");
    expect(mine.reasons.map((r) => r.code)).not.toContain("perfil_desejado_mutuo");
    expect(mine.total).toBeGreaterThan(theirs.total + 39);
  });

  it("dupla existente somente por target fit recebe kind perfil_desejado", () => {
    expect(classifyKind(me, fitOther)).toEqual({ kind: "perfil_desejado", hasSignal: true });
  });

  it("sinal comercial tem precedência sobre o target fit no kind", () => {
    const commercial = {
      ...me,
      needs: [{ id: "n1", kind: "servico" as const, label: "Marketing" }],
    };
    const supplier = { ...fitOther, offers: [{ id: "n1", label: "Marketing" }] };
    const kind = classifyKind(commercial, supplier).kind;
    expect(["direto", "hibrido", "bidirecional", "inverso"]).toContain(kind);
    expect(kind).not.toBe("perfil_desejado");
  });

  it("sem sinal comercial e sem full fit não cria dupla", () => {
    const stranger = other({ segmentId: "seg-c", businessSize: "grande" });
    expect(classifyKind(me, stranger).hasSignal).toBe(false);
  });
});
