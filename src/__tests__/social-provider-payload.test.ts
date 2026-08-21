import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOCIAL_CONFIG,
  SOCIAL_RECENT_POSTS_DEFAULT,
  SOCIAL_RECENT_POSTS_MAX,
  SOCIAL_RECENT_POSTS_MIN,
  clampRecentPostsForAi,
  resolveSocialConfig,
} from "@/config/social";
import {
  buildProviderPayloadSnapshot,
  byteLength,
  isSecretKey,
  stripSecrets,
} from "@/lib/social-provider-payload";
import {
  createApifyInstagramProvider,
  mapApifyItemToContext,
  normalizeApifyMediaType,
} from "@/lib/instagram-provider.server";
import {
  limitRecentMedia,
  sanitizeSocialBusinessContext,
  socialContextFingerprint,
} from "@/lib/social-context";
import {
  runSocialEnrichment,
  type SocialCacheRecord,
  type SocialCacheStore,
} from "@/lib/social-enrichment";

// --------------------------------------------------------------- fixtures
function post(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `id-${i}`,
    shortCode: `SC${i}`,
    type: i % 3 === 0 ? "Sidecar" : i % 3 === 1 ? "Video" : "Image",
    caption: `Legenda ${i} sobre nosso produto`,
    hashtags: [`tag${i}`, "varejo"],
    mentions: [`parceiro${i}`],
    url: `https://www.instagram.com/p/SC${i}/`,
    timestamp: `2026-08-0${(i % 9) + 1}T10:00:00.000Z`,
    likesCount: 10 * i,
    commentsCount: i,
    videoViewCount: 100 * i,
    displayUrl: `https://cdn.example/${i}.jpg`,
    dimensionsWidth: 1080,
    ...over,
  };
}

function apifyItem(posts = 12, over: Record<string, unknown> = {}) {
  return {
    username: "empresa",
    fullName: "Empresa Demo",
    biography: "Loja de materiais de construção em Rio Verde",
    businessCategoryName: "Home Improvement",
    externalUrl: "https://empresa.com.br",
    followersCount: 4200,
    followsCount: 300,
    postsCount: 512,
    profilePicUrl: "https://cdn.example/pic.jpg",
    verified: false,
    latestPosts: Array.from({ length: posts }, (_, i) => post(i + 1)),
    ...over,
  };
}

function memoryStore(): SocialCacheStore & { rows: Map<string, SocialCacheRecord> } {
  const rows = new Map<string, SocialCacheRecord>();
  return {
    rows,
    async read(network, handle) {
      const cur = rows.get(`${network}:${handle}`) ?? null;
      if (!cur) return null;
      // Espelha a RPC: o lookup NUNCA devolve o payload bruto.
      const { provider_payload: _omit, ...rest } = cur;
      return rest as SocialCacheRecord;
    },
    async write(record) {
      const key = `${record.network}:${record.normalized_handle}`;
      const prev = rows.get(key);
      // Espelha o COALESCE do banco: sem payload novo, preserva o anterior.
      rows.set(key, {
        ...prev,
        ...record,
        provider_payload: record.provider_payload ?? prev?.provider_payload ?? null,
      });
    },
  };
}

function fakeApify(item: unknown) {
  const calls = { n: 0 };
  const provider = createApifyInstagramProvider(
    { mode: "direct", token: "t0k3n" },
    (async () => {
      calls.n += 1;
      return new Response(JSON.stringify([item]), { status: 200 });
    }) as unknown as typeof fetch,
  );
  return { provider, calls };
}

// ------------------------------------------------------------------ specs
describe("configuração do N de posts para a IA", () => {
  it("default validado é 6, dentro dos limites 3..9", () => {
    expect(SOCIAL_RECENT_POSTS_DEFAULT).toBe(6);
    expect(SOCIAL_RECENT_POSTS_MIN).toBe(3);
    expect(SOCIAL_RECENT_POSTS_MAX).toBe(9);
    expect(DEFAULT_SOCIAL_CONFIG.recentPostsForAi).toBe(6);
  });

  it("clampa overrides fora da faixa e ignora lixo", () => {
    expect(clampRecentPostsForAi(1)).toBe(3);
    expect(clampRecentPostsForAi(99)).toBe(9);
    expect(clampRecentPostsForAi("abc")).toBe(6);
    expect(resolveSocialConfig({ SOCIAL_RECENT_POSTS_LIMIT: "9" }).recentPostsForAi).toBe(9);
    expect(resolveSocialConfig({ SOCIAL_RECENT_POSTS_LIMIT: "3" }).recentPostsForAi).toBe(3);
    expect(resolveSocialConfig({}).recentPostsForAi).toBe(6);
  });
});

describe("mapeamento do payload real da Apify", () => {
  it("preserva id, tipo, hashtags, menções, permalink e engajamento", () => {
    const ctx = mapApifyItemToContext(apifyItem(12), "empresa");
    expect(ctx).not.toBeNull();
    const media = ctx!.recentMedia ?? [];
    expect(media).toHaveLength(12);
    expect(media[0]).toMatchObject({
      postId: "id-1",
      shortCode: "SC1",
      mediaType: "VIDEO",
      permalink: "https://www.instagram.com/p/SC1/",
    });
    expect(media[0]?.hashtags).toContain("varejo");
    expect(media[0]?.mentions).toEqual(["parceiro1"]);
    expect(media[0]?.engagement?.likes).toBe(10);
  });

  it("normaliza reel, carrossel e imagem", () => {
    expect(normalizeApifyMediaType("Sidecar")).toBe("CAROUSEL_ALBUM");
    expect(normalizeApifyMediaType("Video")).toBe("VIDEO");
    expect(normalizeApifyMediaType("Image")).toBe("IMAGE");
    expect(normalizeApifyMediaType("algo-novo")).toBe("OTHER");
  });

  it("tolera post sem caption", () => {
    const ctx = mapApifyItemToContext(apifyItem(1, { latestPosts: [post(1, { caption: null })] }), "empresa");
    expect(ctx!.recentMedia?.[0]?.caption).toBeUndefined();
    expect(ctx!.recentMedia?.[0]?.postId).toBe("id-1");
  });
});

describe("payload bruto como patrimônio do backend", () => {
  it("remove segredos recursivamente e redige tokens em URLs", () => {
    expect(isSecretKey("apiToken")).toBe(true);
    expect(isSecretKey("Set-Cookie")).toBe(true);
    expect(isSecretKey("caption")).toBe(false);
    const clean = stripSecrets({
      username: "empresa",
      apiToken: "abc",
      headers: { authorization: "Bearer x", cookie: "a=b" },
      nested: [{ password: "p", url: "https://api.apify.com/v2/acts?token=SEGREDO&x=1" }],
    }) as Record<string, unknown>;
    expect(JSON.stringify(clean)).not.toContain("abc");
    expect(JSON.stringify(clean)).not.toContain("SEGREDO");
    expect(JSON.stringify(clean)).not.toContain("Bearer");
    expect(clean["username"]).toBe("empresa");
  });

  it("persiste os 12 posts recebidos quando cabe no teto", () => {
    const snap = buildProviderPayloadSnapshot(apifyItem(12), { maxBytes: 256 * 1024, keepPosts: 6 });
    expect(snap.postsReceived).toBe(12);
    expect(snap.postsPersisted).toBe(12);
    expect(snap.truncated).toBe(false);
    expect(snap.bytes).toBe(byteLength(snap.payload));
  });

  it("mantém campos desconhecidos do provider", () => {
    const snap = buildProviderPayloadSnapshot(
      apifyItem(2, { campoNovoDoProvider: { a: 1 } }),
      { maxBytes: 256 * 1024, keepPosts: 6 },
    );
    expect(snap.payload["campoNovoDoProvider"]).toEqual({ a: 1 });
    expect((snap.payload["latestPosts"] as unknown[])[0]).toHaveProperty("displayUrl");
  });

  it("payload gigante trunca sem perder perfil nem os posts da IA", () => {
    const huge = apifyItem(12, {
      latestPosts: Array.from({ length: 12 }, (_, i) => post(i + 1, { caption: "x".repeat(40_000) })),
    });
    const snap = buildProviderPayloadSnapshot(huge, { maxBytes: 100 * 1024, keepPosts: 6 });
    expect(snap.truncated).toBe(true);
    expect(snap.payload["username"]).toBe("empresa");
    expect(snap.postsReceived).toBe(12);
    expect(snap.postsPersisted).toBeGreaterThanOrEqual(6);
    expect(snap.postsPersisted).toBeLessThan(12);
  });
});

describe("fingerprint semântico", () => {
  const base = sanitizeSocialBusinessContext(mapApifyItemToContext(apifyItem(6), "empresa"))!;

  it("ignora variação de métricas (likes/comments/followers)", () => {
    const metrics = sanitizeSocialBusinessContext(
      mapApifyItemToContext(
        apifyItem(6, {
          followersCount: 99_999,
          latestPosts: Array.from({ length: 6 }, (_, i) => post(i + 1, { likesCount: 9999, commentsCount: 777 })),
        }),
        "empresa",
      ),
    )!;
    expect(socialContextFingerprint(metrics)).toBe(socialContextFingerprint(base));
  });

  it("muda quando a legenda ou o post muda", () => {
    const changed = sanitizeSocialBusinessContext(
      mapApifyItemToContext(
        apifyItem(6, {
          latestPosts: Array.from({ length: 6 }, (_, i) => post(i + 1, { caption: `outro texto ${i}` })),
        }),
        "empresa",
      ),
    )!;
    expect(socialContextFingerprint(changed)).not.toBe(socialContextFingerprint(base));
  });
});

describe("pipeline: persiste tudo, IA usa N", () => {
  function analyzer(seen: number[]) {
    return {
      model: "test-model",
      promptVersion: "v-test",
      async analyze(ctx: { recentMedia?: unknown[] }) {
        seen.push(ctx.recentMedia?.length ?? 0);
        return { positioning: "loja de materiais" };
      },
    };
  }

  it.each([3, 6, 9])("com N=%i: 12 recebidos, 12 persistidos, N usados", async (n) => {
    const store = memoryStore();
    const seen: number[] = [];
    const { provider, calls } = fakeApify(apifyItem(12));
    const res = await runSocialEnrichment({
      raw: "@empresa",
      actor: "actor-1",
      deps: {
        provider,
        store,
        analyzer: analyzer(seen),
        config: { ...DEFAULT_SOCIAL_CONFIG, recentPostsForAi: n },
      },
    });
    expect(res.status).toBe("ok");
    expect(calls.n).toBe(1);
    expect(seen).toEqual([n]);
    const row = store.rows.get("instagram:empresa")!;
    expect(row.provider_posts_received).toBe(12);
    expect(row.provider_posts_persisted).toBe(12);
    expect(row.ai_posts_used).toBe(n);
    expect((row.provider_payload?.["latestPosts"] as unknown[]).length).toBe(12);
    expect(row.context_schema_version).toBe("2");
  });

  it("limitRecentMedia nunca amplia a lista", () => {
    const ctx = sanitizeSocialBusinessContext(mapApifyItemToContext(apifyItem(4), "empresa"))!;
    expect(limitRecentMedia(ctx, 9).recentMedia).toHaveLength(4);
    expect(limitRecentMedia(ctx, 3).recentMedia).toHaveLength(3);
  });

  it("dois participantes no mesmo @: cache hit, Apify = 0 na segunda vez", async () => {
    const store = memoryStore();
    const seen: number[] = [];
    const { provider, calls } = fakeApify(apifyItem(12));
    const deps = { provider, store, analyzer: analyzer(seen), config: DEFAULT_SOCIAL_CONFIG };
    await runSocialEnrichment({ raw: "@empresa", actor: "a", deps });
    const second = await runSocialEnrichment({ raw: "instagram.com/empresa", actor: "b", deps });
    expect(calls.n).toBe(1);
    expect(second.status).toBe("ok");
    if (second.status === "ok") {
      expect(second.providerCalls).toBe(0);
      expect(second.aiCalls).toBe(0);
      expect(second.analysisReused).toBe(true);
    }
    // O payload guardado sobrevive à reescrita sem coleta nova (reload).
    const reload = await runSocialEnrichment({ raw: "@empresa", actor: "b", cacheOnly: true, deps });
    expect(reload.status).toBe("ok");
    expect((store.rows.get("instagram:empresa")!.provider_payload?.["latestPosts"] as unknown[]).length).toBe(12);
  });

  it("novo fetch com conteúdo idêntico não gasta IA (fingerprint igual)", async () => {
    const store = memoryStore();
    const seen: number[] = [];
    const { provider } = fakeApify(apifyItem(12));
    const deps = { provider, store, analyzer: analyzer(seen), config: DEFAULT_SOCIAL_CONFIG };
    await runSocialEnrichment({ raw: "@empresa", actor: "a", deps });
    const forced = await runSocialEnrichment({ raw: "@empresa", actor: "a", force: true, deps });
    expect(seen).toHaveLength(1);
    if (forced.status === "ok") {
      expect(forced.providerCalls).toBe(1);
      expect(forced.aiCalls).toBe(0);
    }
  });

  it("nenhum segredo do provider chega ao que é persistido", async () => {
    const store = memoryStore();
    const { provider } = fakeApify(apifyItem(3, { apiToken: "SUPERSECRETO", cookies: [{ value: "c" }] }));
    await runSocialEnrichment({
      raw: "@empresa",
      actor: "a",
      deps: { provider, store, config: DEFAULT_SOCIAL_CONFIG },
    });
    const dump = JSON.stringify(store.rows.get("instagram:empresa"));
    expect(dump).not.toContain("SUPERSECRETO");
    expect(dump).not.toContain("apiToken");
  });
});
