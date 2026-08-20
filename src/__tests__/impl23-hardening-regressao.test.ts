import { describe, expect, it } from "vitest";
import { cleanApifyText, mapApifyItemToContext } from "@/lib/instagram-provider.server";

/**
 * IMPL 23 — hardening/regressão.
 *
 * Bug real observado em coleta ao vivo (`@natgeo`): a Apify devolve o texto
 * "None" quando o perfil não tem categoria de negócio, e esse placeholder
 * chegava ao `SocialBusinessContext` (e ao prompt da análise) como se fosse
 * uma categoria comercial legítima.
 */
describe("IMPL 23 — placeholders textuais da Apify", () => {
  it("trata placeholders como ausência de valor", () => {
    for (const raw of ["None", "none", " NULL ", "undefined", "n/a", "-", "   "]) {
      expect(cleanApifyText(raw)).toBeUndefined();
    }
  });

  it("preserva valores reais (apenas aparados)", () => {
    expect(cleanApifyText("  Restaurante  ")).toBe("Restaurante");
    expect(cleanApifyText(undefined)).toBeUndefined();
    expect(cleanApifyText(42)).toBe(42);
  });

  it("não propaga categoria 'None' para o contexto", () => {
    const ctx = mapApifyItemToContext(
      {
        username: "natgeo",
        fullName: "National Geographic",
        biography: "Experience the world through the eyes of National Geographic photographers.",
        businessCategoryName: "None",
        followersCount: 268_000_000,
        postsCount: 31_911,
        latestPosts: [],
      },
      "natgeo",
    );
    expect(ctx).not.toBeNull();
    expect(ctx?.category ?? null).toBeNull();
    expect(ctx?.handle).toBe("natgeo");
    expect(ctx?.displayName).toBe("National Geographic");
  });

  it("mantém categoria comercial legítima", () => {
    const ctx = mapApifyItemToContext(
      { username: "burgerlocal", businessCategoryName: "Restaurant", latestPosts: [] },
      "burgerlocal",
    );
    expect(ctx?.category).toBe("Restaurant");
  });
});
