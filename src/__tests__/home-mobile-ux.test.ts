import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8");

describe("Home mobile UX — estrutura do código", () => {
  const hero = read("src/components/home/Hero.tsx");
  const process = read("src/components/home/ProcessPanel.tsx");
  const header = read("src/components/home/HomeHeader.tsx");
  const heroMobile = read("src/components/home/HeroVisualMobile.tsx");

  it("Hero: visual desktop está oculto em < md (hidden md:block) e mobile visível em < md (md:hidden)", () => {
    expect(hero).toMatch(
      /data-testid="hero-visual-desktop"[\s\S]*?hidden md:block|hidden md:block[\s\S]*?data-testid="hero-visual-desktop"/,
    );
    expect(hero).toMatch(
      /md:hidden[\s\S]*?data-testid="hero-visual-mobile"|data-testid="hero-visual-mobile"[\s\S]*?md:hidden/,
    );
  });

  it("Hero: importa HeroVisualMobile dedicado (não é apenas o desktop escondido)", () => {
    expect(hero).toContain("import { HeroVisualMobile }");
    expect(hero).toContain("<HeroVisualMobile />");
  });

  it("Hero: usa clamp() na headline e envolve destaques em whitespace-nowrap para não separar da vírgula", () => {
    expect(hero).toMatch(/clamp\(2rem,\s*9\.5vw,\s*3\.25rem\)/);
    expect(hero).toMatch(
      /whitespace-nowrap[\s\S]*?<Highlight bg="var\(--success\)">clientes<\/Highlight>,/,
    );
  });

  it("Hero: apresenta 3 categorias mobile (Clientes, Fornecedores, Parceiros)", () => {
    expect(hero).toContain('data-testid="hero-mobile-categories"');
    expect(hero).toMatch(/label:\s*"Clientes"/);
    expect(hero).toMatch(/label:\s*"Fornecedores"/);
    expect(hero).toMatch(/label:\s*"Parceiros"/);
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

  it("HeroVisualMobile: acessível via role=img + aria-label descritivo", () => {
    expect(heroMobile).toContain('role="img"');
    expect(heroMobile).toMatch(/aria-label="[^"]*match encontrado[^"]*"/i);
    expect(heroMobile).toContain("clamp(260px, 78vw, 340px)");
  });
});
