import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

const stats = vi.hoisted(() => ({
  current: { data: undefined as undefined | Record<string, number>, isError: false },
}));

vi.mock("@/features/staff/useEventStats", () => ({
  useEventStats: () => stats.current,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: unknown }) => createElement("a", null, children as never),
}));

const { ProcessPanel, formatAggregateMetric } = await import("@/components/home/ProcessPanel");

const LABELS = ["Participantes", "Matches gerados", "Interesses mútuos"] as const;

function setStats(data: Record<string, number> | undefined, isError = false) {
  stats.current = { data, isError };
}
function html() {
  return renderToStaticMarkup(createElement(ProcessPanel));
}
function valueOf(markup: string, label: string): string | null {
  const m = markup.match(
    new RegExp(`data-testid="metric-value-${label}"[^>]*>([^<]*)<`),
  );
  return m ? m[1] : null;
}

beforeEach(() => setStats(undefined));

describe("Bloco DADOS DO SUDOEXPO MATCH — dados reais", () => {
  it("não contém mais números hardcoded no bloco", () => {
    const src = readFileSync("src/components/home/ProcessPanel.tsx", "utf8");
    expect(src).not.toMatch(/\+120|\+380|\+65/);
    expect(src).toContain("useEventStats");
  });

  it("compartilha a fonte de verdade do painel público (RPC event_stats)", () => {
    const hook = readFileSync("src/features/staff/useEventStats.ts", "utf8");
    const publico = readFileSync("src/routes/publico.tsx", "utf8");
    const home = readFileSync("src/components/home/ProcessPanel.tsx", "utf8");
    expect(hook).toContain('rpc("event_stats"');
    expect(publico).toContain("useEventStats");
    expect(home).toContain("useEventStats");
    // homepage não implementa regra de contagem própria
    expect(home).not.toMatch(/\.from\(|supabase/);
  });

  it("painel público e homepage mapeiam os mesmos campos", () => {
    const publico = readFileSync("src/routes/publico.tsx", "utf8");
    const home = readFileSync("src/components/home/ProcessPanel.tsx", "utf8");
    for (const field of ["totalProfiles", "totalMatches", "mutualMatches"]) {
      expect(publico).toContain(field);
      expect(home).toContain(field);
    }
  });

  it("mapeia cada card para a métrica correspondente", () => {
    setStats({ totalProfiles: 12, totalMatches: 34, mutualMatches: 7 });
    const markup = html();
    expect(valueOf(markup, "Participantes")).toBe("+12");
    expect(valueOf(markup, "Matches gerados")).toBe("+34");
    expect(valueOf(markup, "Interesses mútuos")).toBe("+7");
  });

  it("valores diferentes no backend aparecem corretamente", () => {
    setStats({ totalProfiles: 999, totalMatches: 1, mutualMatches: 250 });
    const markup = html();
    expect(valueOf(markup, "Participantes")).toBe("+999");
    expect(valueOf(markup, "Matches gerados")).toBe("+1");
    expect(valueOf(markup, "Interesses mútuos")).toBe("+250");
  });

  it("zero aparece como 0, nunca +0", () => {
    expect(formatAggregateMetric(0)).toBe("0");
    setStats({ totalProfiles: 0, totalMatches: 0, mutualMatches: 0 });
    const markup = html();
    for (const label of LABELS) expect(valueOf(markup, label)).toBe("0");
    expect(markup).not.toContain("+0");
  });

  it("loading usa skeleton e não mostra dados falsos", () => {
    setStats(undefined);
    const markup = html();
    for (const label of LABELS) {
      expect(markup).toContain(`metric-skeleton-${label}`);
      expect(valueOf(markup, label)).toBeNull();
    }
    expect(markup).toContain("DADOS DO SUDOEXPO MATCH");
    expect(markup).not.toMatch(/\+\d/);
  });

  it("erro mantém a homepage renderizada e sem fallback hardcoded", () => {
    setStats(undefined, true);
    const markup = html();
    expect(markup).toContain("DADOS DO SUDOEXPO MATCH");
    for (const label of LABELS) expect(valueOf(markup, label)).toBe("—");
    expect(markup).not.toMatch(/\+\d/);
  });

  it("mantém a composição visual (grid 3 colunas, ícones, cores)", () => {
    setStats({ totalProfiles: 5, totalMatches: 5, mutualMatches: 5 });
    const markup = html();
    expect(markup).toContain("grid grid-cols-3 gap-1.5 p-1.5");
    expect(markup).toContain("var(--success)");
    expect(markup).toContain("var(--secondary)");
    expect(markup).toContain("var(--accent)");
    for (const label of LABELS) expect(markup).toContain(label);
  });
});
