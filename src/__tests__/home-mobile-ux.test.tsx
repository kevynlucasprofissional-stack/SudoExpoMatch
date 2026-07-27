import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Hero } from "@/components/home/Hero";
import { ProcessPanel } from "@/components/home/ProcessPanel";
import { HomeHeader } from "@/components/home/HomeHeader";

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => null });
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
  return render(<RouterProvider router={router as never} />);
}

describe("Home mobile UX", () => {
  it("Hero: visual desktop e visual mobile coexistem no DOM com classes de gating", () => {
    const { getByTestId } = renderWithRouter(<Hero />);
    const desktop = getByTestId("hero-visual-desktop");
    const mobile = getByTestId("hero-visual-mobile");
    expect(desktop.className).toMatch(/hidden/);
    expect(desktop.className).toMatch(/md:block/);
    expect(mobile.className).toMatch(/md:hidden/);
  });

  it("Hero: apresenta exatamente 3 categorias no bloco mobile", () => {
    const { getByTestId } = renderWithRouter(<Hero />);
    const list = getByTestId("hero-mobile-categories");
    expect(list.tagName).toBe("UL");
    expect(list.querySelectorAll("li").length).toBe(3);
    expect(list.textContent).toContain("Clientes");
    expect(list.textContent).toContain("Fornecedores");
    expect(list.textContent).toContain("Parceiros");
  });

  it("ProcessPanel: painel público é agregado (sem CTA 'Explorar participantes')", () => {
    const { getByTestId, queryByText } = renderWithRouter(<ProcessPanel />);
    const panel = getByTestId("public-panel-aggregate");
    expect(panel.textContent).toContain("Painel público");
    expect(panel.textContent).toContain("Acompanhar painel público");
    expect(queryByText(/Explorar participantes/i)).toBeNull();
    expect(queryByText(/TechSolutions/)).toBeNull();
  });

  it("ProcessPanel: etapas mobile em lista vertical (não em grade horizontal apertada)", () => {
    const { getByTestId } = renderWithRouter(<ProcessPanel />);
    const ol = getByTestId("process-steps-mobile");
    expect(ol.className).toMatch(/flex-col/);
    expect(ol.querySelectorAll("li").length).toBe(4);
  });

  it("HomeHeader: botão de menu tem aria-label, aria-expanded e área >=44px", () => {
    const { container } = renderWithRouter(<HomeHeader />);
    const btn = container.querySelector('button[aria-controls="home-mobile-menu"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute("aria-label")).toBeTruthy();
    expect(btn!.getAttribute("aria-expanded")).toBe("false");
    expect(btn!.className).toMatch(/h-11/);
    expect(btn!.className).toMatch(/w-11/);
  });
});
