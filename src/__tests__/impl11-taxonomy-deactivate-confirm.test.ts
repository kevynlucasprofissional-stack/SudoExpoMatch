/**
 * @vitest-environment happy-dom
 *
 * IMPL 11 (hardening) — comportamento real da UI de desativação:
 * desativar exige confirmação; cancelar não muta; reativar é direto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mutateAsync = vi.fn(async (_vars: { itemId: string; active: boolean }) => ({}));
const detail = { data: undefined as unknown, isLoading: false, isError: false, error: null };

vi.mock("@/features/admin/useAdminTaxonomy", () => ({
  useAdminTaxonomy: () => ({ data: { items: [], total: 0 }, isLoading: false }),
  useAdminTaxonomyDetail: () => detail,
  useUpdateTaxonomyItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTaxonomyItemActive: () => ({ mutateAsync, isPending: false }),
  useCreateTaxonomyRelation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTaxonomyRelation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTaxonomyRelationActive: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { TaxonomyItemSheet } = await import("@/features/admin/TaxonomyItemSheet");

function makeDetail(active: boolean) {
  return {
    item: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "consultoria",
      label: "Consultoria",
      kind: "both",
      segment_id: "servicos",
      segment_label: "Serviços",
      description: "",
      synonyms: [],
      active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      usage_offers_active: 1,
      usage_offers_total: 2,
      usage_needs_active: 1,
      usage_needs_total: 1,
      usage_match_reasons: 1,
    },
    relations: [],
  };
}

function renderSheet() {
  return render(
    createElement(TaxonomyItemSheet, {
      eventId: "sudoexpo-2026",
      itemId: "11111111-1111-4111-8111-111111111111",
      segments: [],
      onOpenChange: () => {},
    }),
  );
}

beforeEach(() => {
  mutateAsync.mockClear();
});
afterEach(() => cleanup());

describe("Impl 11 — confirmação de desativação", () => {
  it("desligar o switch abre confirmação e NÃO muta antes de confirmar", async () => {
    detail.data = makeDetail(true);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("novos cadastros");
  });

  it("cancelar fecha o diálogo sem mutação", async () => {
    detail.data = makeDetail(true);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("confirmar chama a RPC uma única vez com active=false", async () => {
    detail.data = makeDetail(true);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /Desativar item/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ active: false });
  });

  it("reativar não pede confirmação", async () => {
    detail.data = makeDetail(false);
    renderSheet();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("switch"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ active: true });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
