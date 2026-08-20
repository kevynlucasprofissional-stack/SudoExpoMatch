import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

const stats = vi.hoisted(() => ({
  current: {
    data: undefined as undefined | Record<string, number>,
    isError: false,
  },
}));

vi.mock("@/features/staff/useEventStats", () => ({
  useEventStats: () => stats.current,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...(rest as object)}>{children}</a>
  ),
}));

import { ProcessPanel, formatAggregateMetric } from "@/components/home/ProcessPanel";

const LABELS = ["Participantes", "Matches gerados", "Interesses mútuos"] as const;

function setStats(data: Record<string, number> | undefined, isError = false) {
  stats.current = { data, isError };
}

beforeEach(() => setStats(undefined));

describe("Bloco DADOS DO SUDOEXPO MATCH — dados reais", () => {
  it("não contém mais números hardcoded no componente", () => {
    const src = readFileSync("src/components/home/ProcessPanel.tsx", "utf8");
    expect(src).not.toMatch(/\+120|\+380|\+65/);
    expect(src).toContain("useEventStats");
  });

  it("usa a mesma fonte de verdade do painel público (RPC event_stats)", () => {
    const hook = readFileSync("src/features/staff/useEventStats.ts", "utf8");
    const publico = readFileSync("src/routes/publico.tsx", "utf8");
    const home = readFileSync("src/components/home/ProcessPanel.tsx", "utf8");
    expect(hook).toContain('rpc("event_stats"');
    expect(publico).toContain("useEventStats");
    expect(home).toContain("useEventStats");
    // Nenhuma contagem própria na homepage
    expect(home).not.toMatch(/\.from\(|rpc\(/);
  });

  it("mapeia cada card para a métrica correspondente do painel público", () => {
    setStats({ totalProfiles: 12, totalMatches: 34, mutualMatches: 7 });
    render(<ProcessPanel />);
    expect(screen.getByTestId("metric-value-Participantes").textContent).toMatch("+12");
    expect(screen.getByTestId("metric-value-Matches gerados").textContent).toMatch("+34");
    expect(screen.getByTestId("metric-value-Interesses mútuos").textContent).toMatch("+7");
  });

  it("reflete valores diferentes do backend", () => {
    setStats({ totalProfiles: 999, totalMatches: 1, mutualMatches: 250 });
    render(<ProcessPanel />);
    expect(screen.getByTestId("metric-value-Participantes").textContent).toMatch("+999");
    expect(screen.getByTestId("metric-value-Matches gerados").textContent).toMatch("+1");
    expect(screen.getByTestId("metric-value-Interesses mútuos").textContent).toMatch("+250");
  });

  it("zero aparece como 0 (nunca +0)", () => {
    expect(formatAggregateMetric(0)).toBe("0");
    setStats({ totalProfiles: 0, totalMatches: 0, mutualMatches: 0 });
    render(<ProcessPanel />);
    for (const label of LABELS) {
      expect(screen.getByTestId(`metric-value-${label}`).textContent).toMatch(/^0$/);
    }
  });

  it("loading mostra skeleton, nunca dados falsos", () => {
    setStats(undefined);
    render(<ProcessPanel />);
    for (const label of LABELS) {
      expect(screen.getByTestId(`metric-skeleton-${label}`)).toBeTruthy();
      expect(screen.queryByTestId(`metric-value-${label}`)).toBeNull();
    }
    expect(screen.getByText("DADOS DO SUDOEXPO MATCH")).toBeTruthy();
  });

  it("erro não quebra a homepage e não usa fallback hardcoded", () => {
    setStats(undefined, true);
    expect(() => render(<ProcessPanel />)).not.toThrow();
    expect(screen.getByText("DADOS DO SUDOEXPO MATCH")).toBeTruthy();
    for (const label of LABELS) {
      expect(screen.getByTestId(`metric-value-${label}`).textContent).toMatch("—");
    }
  });
});
