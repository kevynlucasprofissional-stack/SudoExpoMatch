import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(__dirname, "..", "..", "src/components/home/HeroVisual.tsx"),
  "utf8",
);

describe("HeroVisual desktop — refinamento estrutural", () => {
  it("Person tem camadas hair-back e hair-front separadas (evita cabelo sobre olhos)", () => {
    expect(src).toContain('data-layer="hair-back"');
    expect(src).toContain('data-layer="hair-front"');
    expect(src).toContain('data-layer="face"');
    expect(src).toContain('data-layer="features"');
    expect(src).toContain('data-layer="wear-front"');
  });

  it("hair-back é declarado ANTES de face, e hair-front é declarado DEPOIS de face", () => {
    const backIdx = src.indexOf('data-layer="hair-back"');
    const faceIdx = src.indexOf('data-layer="face"');
    const frontIdx = src.indexOf('data-layer="hair-front"');
    const featIdx = src.indexOf('data-layer="features"');
    expect(backIdx).toBeGreaterThan(-1);
    expect(backIdx).toBeLessThan(faceIdx);
    expect(faceIdx).toBeLessThan(frontIdx);
    expect(frontIdx).toBeLessThan(featIdx);
  });

  it("usa useId para IDs de gradients/filters (evita colisão em múltiplas instâncias)", () => {
    expect(src).toContain("useId()");
    expect(src).toMatch(/hv-fair-bg-\$\{uid\}/);
  });

  it("chips ficam em zona lateral dedicada com testid próprio (não invadem cards)", () => {
    expect(src).toContain('data-testid="hero-visual-chips"');
    expect(src).toContain('label="Serviços"');
  });

  it("cards inferiores usam grid com coluna central reservada para o selo de match", () => {
    expect(src).toContain('data-testid="hero-visual-cards"');
    expect(src).toContain('data-testid="hero-visual-match-badge"');
    expect(src).toMatch(/gridTemplateColumns:\s*"minmax\(0,1fr\)\s+minmax\(80px,\s*110px\)\s+minmax\(0,1fr\)"/);
  });

  it("NÃO usa as posições antigas de colisão (left:-8px bottom:-8px, right:52px bottom:-8px, bottom:-36px)", () => {
    expect(src).not.toMatch(/left-\[-8px\]\s+bottom-\[-8px\]/);
    expect(src).not.toMatch(/right-\[52px\]\s+bottom-\[-8px\]/);
    expect(src).not.toMatch(/bottom-\[-36px\]/);
  });
});
