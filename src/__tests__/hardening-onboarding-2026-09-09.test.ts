/**
 * Hardening pós-incidente de cadastro de 09/09/2026.
 *
 * Cobre: (a) identidade de item (acento/espaço, catálogo + texto livre),
 * (b) evento efetivo (`targetEventId`) chegando às etapas e aos analytics,
 * (c) retry de contato em modo criação concluindo o fluxo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isEquivalentItem, findDuplicatePair } from "@/features/onboarding/itemIdentity";
import { shouldRecomputeAfterContactRetry } from "@/features/onboarding/submitOrchestrator";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const route = () => read("src/routes/participar.tsx");

const TAX = "11111111-1111-1111-1111-111111111111";

describe("(a) duplicata por normalização e catálogo + texto livre", () => {
  it("acento e espaço duplo colidem, como no banco (norm_label)", () => {
    expect(isEquivalentItem({ label: "Insumos agrícolas" }, { label: "insumos  agricolas" })).toBe(
      true,
    );
  });

  it("item do catálogo e texto livre com o mesmo label colidem", () => {
    const pair = findDuplicatePair([
      { label: "Insumos agrícolas", taxonomyItemId: TAX },
      { label: "insumos agricolas", taxonomyItemId: null },
    ]);
    expect(pair).not.toBeNull();
  });

  it("itens distintos continuam permitidos", () => {
    expect(isEquivalentItem({ label: "Insumos agrícolas" }, { label: "Máquinas agrícolas" })).toBe(
      false,
    );
  });
});

describe("(b) evento efetivo no wizard", () => {
  it("Offers e Needs recebem targetEventId, não EVENT_ID", () => {
    const src = route();
    expect(src).not.toMatch(/eventId=\{EVENT_ID\}/);
    expect(src.match(/eventId=\{targetEventId\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("analytics de onboarding usam targetEventId e dedupe por evento", () => {
    const src = route();
    expect(src).not.toMatch(/eventId: EVENT_ID/);
    expect(src).toMatch(/kind: "onboarding_started"[\s\S]{0,120}eventId: targetEventId/);
    expect(src).toMatch(/kind: "onboarding_completed"[\s\S]{0,160}eventId: targetEventId/);
    expect(src).toMatch(/dedupeKey: `onboarding_started:\$\{targetEventId\}/);
    expect(src).toMatch(/dedupeKey: `onboarding_completed:\$\{targetEventId\}`/);
  });

  it("EVENT_ID permanece apenas como fallback do search param", () => {
    expect(route()).toMatch(/targetEventId = search\.event \? search\.event : EVENT_ID/);
  });
});

describe("(c) retry de contato não fica preso em recomputing_matches", () => {
  it("recupera nos dois modos", () => {
    expect(shouldRecomputeAfterContactRetry("create")).toBe(true);
    expect(shouldRecomputeAfterContactRetry("edit")).toBe(true);
  });

  it("a rota usa o helper no retry e não condiciona a mode !== create", () => {
    const src = route();
    expect(src).toMatch(/if \(shouldRecomputeAfterContactRetry\(mode\)\)/);
    expect(src).not.toMatch(/if \(mode !== "create"\) \{\s*await runRecompute\(\)/);
  });
});
