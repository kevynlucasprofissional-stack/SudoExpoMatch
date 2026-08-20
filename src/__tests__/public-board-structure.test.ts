import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = readFileSync("src/routes/publico.tsx", "utf8");

describe("painel público — estrutura", () => {
  it("usa a fonte de verdade existente (RPC event_stats via useEventStats)", () => {
    expect(SRC).toContain("useEventStats");
    expect(SRC).not.toContain("supabase.rpc(");
  });

  it("exibe as quatro métricas reais", () => {
    for (const field of ["totalProfiles", "totalMatches", "mutualMatches", "completedConnections"]) {
      expect(SRC).toContain(`stats?.${field}`);
    }
    for (const label of ["Participantes", "Matches gerados", "Interesse mútuo", "Conexões concluídas"]) {
      expect(SRC).toContain(label);
    }
  });

  it("não usa números hardcoded nem prefixo +", () => {
    expect(SRC).not.toMatch(/\+120|\+380|\+65/);
    expect(SRC).not.toMatch(/"\+"\s*\+/);
  });

  it("tem relógio local seguro para hidratação", () => {
    expect(SRC).toContain('data-testid="public-clock"');
    expect(SRC).toContain("useState<string | null>(null)");
    expect(SRC).toContain("setInterval");
  });

  it("tem skeleton de loading e estado de erro", () => {
    expect(SRC).toContain("animate-pulse");
    expect(SRC).toContain("statsQuery.isError");
  });

  it("tem 4 cards em uma linha no desktop e grade responsiva", () => {
    expect(SRC).toContain("sm:grid-cols-2");
    expect(SRC).toContain("xl:grid-cols-4");
  });

  it("mantém a frase institucional no rodapé visual", () => {
    expect(SRC).toContain("Aqui, ninguém cresce isolado.");
    expect(SRC).toContain("A gente cresce");
    expect(SRC).toContain("conectado.");
  });
});
