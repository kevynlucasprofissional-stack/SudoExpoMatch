/**
 * @vitest-environment happy-dom
 *
 * IMPL 12 — relações complementares editáveis pelo admin.
 * Cobre validação do formulário, tradução de erros do servidor e o
 * comportamento da UI (criar, editar e desativar com confirmação).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  MATCHER_MIN_RELATION_WEIGHT,
  MAX_RATIONALE_LENGTH,
  relationFormSchema,
  translateTaxonomyError,
} from "@/features/admin/taxonomySchemas";

const createMutate = vi.fn(async () => ({}));
const updateMutate = vi.fn(async () => ({}));
const toggleMutate = vi.fn(async () => ({}));
const detail = { data: undefined as unknown, isLoading: false, isError: false, error: null };

vi.mock("@/features/admin/useAdminTaxonomy", () => ({
  useAdminTaxonomy: () => ({
    data: {
      items: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          label: "Marketing digital",
          segment_label: "Serviços",
        },
      ],
      total: 1,
    },
    isLoading: false,
  }),
  useAdminTaxonomyDetail: () => detail,
  useUpdateTaxonomyItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTaxonomyItemActive: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTaxonomyRelation: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateTaxonomyRelation: () => ({ mutateAsync: updateMutate, isPending: false }),
  useSetTaxonomyRelationActive: () => ({ mutateAsync: toggleMutate, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { TaxonomyItemSheet } = await import("@/features/admin/TaxonomyItemSheet");

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const REL_ID = "33333333-3333-4333-8333-333333333333";

function makeDetail(relActive: boolean) {
  return {
    item: {
      id: ITEM_ID,
      slug: "consultoria",
      label: "Consultoria",
      kind: "both",
      segment_id: "servicos",
      segment_label: "Serviços",
      description: "",
      synonyms: [],
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      usage_offers_active: 0,
      usage_offers_total: 0,
      usage_needs_active: 0,
      usage_needs_total: 0,
      usage_match_reasons: 0,
    },
    relations: [
      {
        id: REL_ID,
        direction: "outgoing" as const,
        relation_type: "complements",
        weight: 60,
        rationale: null,
        active: relActive,
        other_id: "22222222-2222-4222-8222-222222222222",
        other_label: "Marketing digital",
        other_segment_id: "servicos",
        other_segment_label: "Serviços",
        other_active: true,
      },
    ],
  };
}

function renderSheet() {
  return render(
    createElement(TaxonomyItemSheet, {
      eventId: "sudoexpo-2026",
      itemId: ITEM_ID,
      segments: [],
      onOpenChange: () => {},
    }),
  );
}

async function openRelationsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Relações" }));
}

beforeEach(() => {
  createMutate.mockClear();
  updateMutate.mockClear();
  toggleMutate.mockClear();
});
afterEach(() => cleanup());

describe("Impl 12 — contrato do formulário de relação", () => {
  it("rejeita item alvo inválido e peso fora do intervalo", () => {
    expect(
      relationFormSchema.safeParse({
        direction: "outgoing",
        otherItemId: "nao-uuid",
        relationType: "complements",
        weight: 60,
        rationale: "",
      }).success,
    ).toBe(false);

    for (const weight of [0, 101, -5]) {
      expect(
        relationFormSchema.safeParse({
          direction: "outgoing",
          otherItemId: "22222222-2222-4222-8222-222222222222",
          relationType: "complements",
          weight,
          rationale: "",
        }).success,
      ).toBe(false);
    }
  });

  it("aceita payload válido e normaliza peso vindo de input string", () => {
    const parsed = relationFormSchema.parse({
      direction: "incoming",
      otherItemId: "22222222-2222-4222-8222-222222222222",
      relationType: "complements",
      weight: "80",
      rationale: "  complementa  ",
    });
    expect(parsed.weight).toBe(80);
    expect(parsed.rationale).toBe("complementa");
  });

  it("rejeita justificativa acima do limite do servidor", () => {
    expect(
      relationFormSchema.safeParse({
        direction: "outgoing",
        otherItemId: "22222222-2222-4222-8222-222222222222",
        relationType: "complements",
        weight: 60,
        rationale: "x".repeat(MAX_RATIONALE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("traduz erros específicos das RPCs de relação", () => {
    expect(translateTaxonomyError(new Error("duplicate_relation"))).toContain("Já existe");
    expect(translateTaxonomyError(new Error("self_relation"))).toContain("ele mesmo");
    expect(translateTaxonomyError(new Error("invalid_weight"))).toContain("peso");
    expect(translateTaxonomyError(new Error("invalid_rationale"))).toContain("justificativa");
    expect(translateTaxonomyError(new Error("forbidden"))).toContain("administradores");
  });

  it("expõe o piso de peso usado pelo matcher", () => {
    expect(MATCHER_MIN_RELATION_WEIGHT).toBe(40);
  });
});

describe("Impl 12 — UI de relações", () => {
  it("cria relação com direção e item escolhidos", async () => {
    detail.data = makeDetail(true);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await openRelationsTab(user);
    await user.click(screen.getByRole("button", { name: "Nova relação" }));
    expect(screen.getByTestId("relation-form")).toBeTruthy();

    await user.click(screen.getByLabelText("Item relacionado"));
    await user.click(await screen.findByRole("option", { name: /Marketing digital/ }));
    await user.click(screen.getByRole("button", { name: "Criar relação" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      direction: "outgoing",
      otherItemId: "22222222-2222-4222-8222-222222222222",
      weight: 60,
    });
  });

  it("edita peso de uma relação existente", async () => {
    detail.data = makeDetail(true);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await openRelationsTab(user);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const weight = screen.getByLabelText("Peso (1 a 100)");
    await user.clear(weight);
    await user.type(weight, "85");
    await user.click(screen.getByRole("button", { name: "Salvar relação" }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0]![0]).toMatchObject({
      relationId: REL_ID,
      values: { weight: 85 },
    });
  });

  it("desativar relação exige confirmação e não muta antes dela", async () => {
    detail.data = makeDetail(true);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await openRelationsTab(user);
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    expect(toggleMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Desativar relação" }));
    await waitFor(() => expect(toggleMutate).toHaveBeenCalledTimes(1));
    expect(toggleMutate.mock.calls[0]![0]).toMatchObject({ relationId: REL_ID, active: false });
  });

  it("reativar relação é direto, sem confirmação", async () => {
    detail.data = makeDetail(false);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await openRelationsTab(user);
    await user.click(screen.getByRole("button", { name: "Reativar" }));

    await waitFor(() => expect(toggleMutate).toHaveBeenCalledTimes(1));
    expect(toggleMutate.mock.calls[0]![0]).toMatchObject({ active: true });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
