import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8");

describe("Home mobile UX — estrutura do código", () => {
  const hero = read("src/components/home/Hero.tsx");
  const process = read("src/components/home/ProcessPanel.tsx");

  it("Hero: usa uma única ilustração compartilhada em todos os tamanhos", () => {
    expect(hero).toContain('data-testid="hero-visual"');
    expect(hero).not.toContain("HeroVisualMobile");
    expect(hero).toContain("<HeroVisual />");
  });

  it("Hero: usa clamp() na headline e envolve destaques em whitespace-nowrap para não separar da vírgula", () => {
    expect(hero).toMatch(/clamp\(1\.6rem,\s*7\.1vw,\s*3\.25rem\)/);
    expect(hero).toMatch(
      /whitespace-nowrap[\s\S]*?<Highlight bg="var\(--success\)">clientes<\/Highlight>,/,
    );
  });

  it("Hero: não exibe mais as categorias compactas no mobile", () => {
    expect(hero).not.toContain('data-testid="hero-mobile-categories"');
    expect(hero).not.toContain("MOBILE_CATEGORIES");
  });


  it("ProcessPanel: painel público agregado (sem CTA 'Explorar participantes' e sem nomes)", () => {
    expect(process).toContain("Acompanhar painel público");
    expect(process).not.toContain("Explorar participantes");
    expect(process).not.toMatch(/TechSolutions|Indústria Alfa|Verde Log/);
    expect(process).toContain("AGGREGATE_METRICS");
  });

  it("ProcessPanel: mobile em coluna vertical, desktop em grid horizontal separado", () => {
    expect(process).toMatch(/data-testid="process-steps-mobile"[\s\S]*?flex-col/);
    expect(process).toMatch(/hidden grid-cols-4[\s\S]*?lg:grid/);
  });

  it("Home: cabeçalho removido da página inicial", () => {
    const index = read("src/routes/index.tsx");
    expect(index).not.toContain("HomeHeader");
  });

  it("HeroVisual: ilustração com alt descritivo", () => {
    const visual = read("src/components/home/HeroVisual.tsx");
    expect(visual).toContain("hero-matchmaker.png.asset.json");
    expect(visual).toMatch(/alt="[^"]+"/);
  });
});

