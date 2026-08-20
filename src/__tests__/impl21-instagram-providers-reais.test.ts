import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRAPH_API_VERSION, resolveGraphApiVersion } from "@/config/social";
import {
  APIFY_ACTOR,
  buildBusinessDiscoveryFields,
  checkInstagramProviderHealth,
  classifyGraphError,
  createApifyInstagramProvider,
  createGraphInstagramProvider,
  createInstagramProviderChain,
  mapApifyItemToContext,
  resolveInstagramProvider,
  shouldTryNextProvider,
} from "@/lib/instagram-provider.server";
import { runSocialEnrichment, type SocialCacheRecord } from "@/lib/social-enrichment";
import { createMemoryTtlCache, type SocialProvider } from "@/lib/social-context";
import { shouldRunSocialEnrichment } from "@/features/onboarding/socialContinue";

const TOKEN = "tok-secret";
const ACCOUNT = "17841400000000000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const GRAPH_OK = {
  business_discovery: {
    username: "empresa_teste",
    name: "Empresa Teste",
    biography: "Consultoria contábil para pequenas indústrias em Rio Verde.",
    website: "https://empresa.com.br",
    followers_count: 1200,
    follows_count: 300,
    media_count: 88,
    profile_picture_url: "https://cdn.example.com/pic.jpg",
    media: {
      data: [
        {
          caption: "Atendemos restaurantes com folha de pagamento",
          media_type: "IMAGE",
          timestamp: "2026-01-02T10:00:00+0000",
          permalink: "https://www.instagram.com/p/abc/",
        },
      ],
    },
  },
};

// --------------------------------------------------------------- versão
describe("versão da Graph API", () => {
  it("usa v26.0 como default validado na documentação oficial", () => {
    expect(DEFAULT_GRAPH_API_VERSION).toBe("v26.0");
    expect(resolveGraphApiVersion({})).toBe("v26.0");
  });

  it("aceita override por ambiente e ignora valores inválidos", () => {
    expect(resolveGraphApiVersion({ INSTAGRAM_GRAPH_API_VERSION: "v27.0" })).toBe("v27.0");
    expect(resolveGraphApiVersion({ INSTAGRAM_GRAPH_API_VERSION: "latest" })).toBe("v26.0");
  });

  it("monta a URL do Business Discovery com a versão configurada", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/v25.0/");
      return jsonResponse(GRAPH_OK);
    }) as unknown as typeof fetch;
    const p = createGraphInstagramProvider(TOKEN, ACCOUNT, fetchImpl, 5, "v25.0");
    const res = await p.fetchProfile("empresa_teste");
    expect(res.status).toBe("ok");
  });
});

// ---------------------------------------------------------------- Graph
describe("provider Graph (Business Discovery)", () => {
  it("pede somente fields oficialmente suportados", () => {
    const fields = buildBusinessDiscoveryFields("acme", 3);
    for (const f of [
      "username",
      "name",
      "biography",
      "website",
      "followers_count",
      "follows_count",
      "media_count",
      "profile_picture_url",
      "media.limit(3)",
      "caption",
      "media_type",
      "timestamp",
      "permalink",
    ]) {
      expect(fields).toContain(f);
    }
    expect(fields).not.toContain("email");
    expect(fields).not.toContain("phone");
  });

  it("mapeia sucesso para o domínio SocialBusinessContext", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GRAPH_OK)) as unknown as typeof fetch;
    const res = await createGraphInstagramProvider(TOKEN, ACCOUNT, fetchImpl).fetchProfile(
      "empresa_teste",
    );
    if (res.status !== "ok") throw new Error("esperava ok");
    expect(res.context.provider).toBe("instagram_graph");
    expect(res.context.handle).toBe("empresa_teste");
    expect(res.context.followersCount).toBe(1200);
    expect(res.context.followsCount).toBe(300);
    expect(res.context.recentMedia?.[0]?.mediaType).toBe("IMAGE");
    expect(res.context.keywords.length).toBeGreaterThan(0);
  });

  it("classifica os erros oficiais da Meta", () => {
    expect(classifyGraphError(400, { error: { code: 190, message: "Invalid OAuth token" } })).toBe(
      "graph_invalid_token",
    );
    expect(classifyGraphError(403, { error: { code: 10, message: "permission" } })).toBe(
      "graph_permission_error",
    );
    expect(classifyGraphError(400, { error: { code: 4, message: "rate" } })).toBe(
      "graph_rate_limited",
    );
    expect(
      classifyGraphError(400, {
        error: { code: 100, error_subcode: 33, message: "Unknown path components" },
      }),
    ).toBe("graph_invalid_business_account");
    expect(
      classifyGraphError(400, {
        error: { code: 100, message: "The user is not a business account" },
      }),
    ).toBe("target_not_professional");
    expect(
      classifyGraphError(400, {
        error: { code: 100, message: "Requested username cannot be found" },
      }),
    ).toBe("target_not_found");
  });

  it("traduz classificações em desfechos do domínio", async () => {
    const cases: Array<[unknown, string]> = [
      [{ error: { code: 190 } }, "unavailable"],
      [{ error: { code: 4 } }, "rate_limited"],
      [{ error: { code: 100, message: "not a business account" } }, "unavailable"],
      [{ error: { code: 100, message: "username cannot be found" } }, "not_found"],
    ];
    for (const [body, expected] of cases) {
      const fetchImpl = vi.fn(async () => jsonResponse(body, 400)) as unknown as typeof fetch;
      const res = await createGraphInstagramProvider(TOKEN, ACCOUNT, fetchImpl).fetchProfile("x");
      expect(res.status).toBe(expected);
    }
  });

  it("não é escolhido quando as credenciais estão ausentes", () => {
    const provider = resolveInstagramProvider({}, (async () => new Response("")) as never);
    expect(provider.id).toBe("instagram_public");
  });

  it("é o primeiro da cadeia quando configurado", () => {
    const provider = resolveInstagramProvider(
      {
        INSTAGRAM_GRAPH_ACCESS_TOKEN: TOKEN,
        INSTAGRAM_BUSINESS_ACCOUNT_ID: ACCOUNT,
        APIFY_API_TOKEN: "apify",
      },
      (async () => new Response("")) as never,
    );
    expect(provider.id).toBe("chain");
  });
});

// ------------------------------------------------------------- gerenciado
describe("provider gerenciado (Apify)", () => {
  const APIFY_ITEM = {
    username: "loja_local",
    fullName: "Loja Local",
    biography: "Materiais de construção e entrega rápida",
    externalUrl: "https://loja.com.br",
    businessCategoryName: "Home improvement",
    followersCount: 800,
    followsCount: 120,
    postsCount: 40,
    profilePicUrl: "https://cdn.example.com/x.jpg",
    latestPosts: [
      { caption: "Entrega para obras", type: "Image", timestamp: "2026-02-01T12:00:00Z", url: "https://www.instagram.com/p/x/" },
    ],
  };

  it("consulta o actor oficial enviando apenas o handle normalizado", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain(APIFY_ACTOR);
      expect(JSON.parse(String(init?.body))).toMatchObject({ usernames: ["loja_local"] });
      expect(String(init?.body)).not.toContain("password");
      return jsonResponse([APIFY_ITEM]);
    }) as unknown as typeof fetch;
    const res = await createApifyInstagramProvider("apify-token", fetchImpl).fetchProfile(
      "loja_local",
    );
    if (res.status !== "ok") throw new Error("esperava ok");
    expect(res.context.provider).toBe("instagram_apify");
    expect(res.context.category).toBe("Home improvement");
    expect(res.context.followersCount).toBe(800);
  });

  it("mapeia apenas campos do nosso domínio (sem payload bruto)", () => {
    const ctx = mapApifyItemToContext({ ...APIFY_ITEM, secretField: "xxx" }, "loja_local");
    expect(ctx).not.toBeNull();
    expect(Object.keys(ctx!)).not.toContain("secretField");
    expect(Object.keys(ctx!)).not.toContain("latestPosts");
  });

  it("trata token ausente, inválido, rate limit, timeout, malformado e not_found", async () => {
    const unconfigured = resolveInstagramProvider({ INSTAGRAM_PUBLIC_READ_DISABLED: "1" });
    expect(unconfigured.id).toBe("unconfigured");

    const invalid = await createApifyInstagramProvider(
      "t",
      (async () => new Response("", { status: 401 })) as never,
    ).fetchProfile("x");
    expect(invalid).toEqual({ status: "unavailable", reason: "config_error" });

    const limited = await createApifyInstagramProvider(
      "t",
      (async () => new Response("", { status: 429 })) as never,
    ).fetchProfile("x");
    expect(limited.status).toBe("rate_limited");

    const malformed = await createApifyInstagramProvider(
      "t",
      (async () => new Response("nao-e-json", { status: 200 })) as never,
    ).fetchProfile("x");
    expect(malformed).toEqual({ status: "unavailable", reason: "error" });

    const notFound = await createApifyInstagramProvider(
      "t",
      (async () => jsonResponse([])) as never,
    ).fetchProfile("x");
    expect(notFound.status).toBe("not_found");

    const timeout = await createApifyInstagramProvider(
      "t",
      (async () => {
        const err = new Error("abort");
        err.name = "AbortError";
        throw err;
      }) as never,
      50,
    ).fetchProfile("x");
    expect(timeout).toEqual({ status: "unavailable", reason: "timeout" });
  });
});

// ------------------------------------------------------------------ cadeia
describe("cadeia de providers", () => {
  function stub(id: SocialProvider["id"], result: Awaited<ReturnType<SocialProvider["fetchProfile"]>>) {
    return {
      id,
      fetchProfile: vi.fn(async () => result),
    } as unknown as SocialProvider & { fetchProfile: ReturnType<typeof vi.fn> };
  }

  it("para no primeiro sucesso (Graph) sem chamar os demais", async () => {
    const graph = stub("instagram_graph", { status: "ok", context: (await createGraphInstagramProvider(TOKEN, ACCOUNT, (async () => jsonResponse(GRAPH_OK)) as never).fetchProfile("empresa_teste") as { status: "ok"; context: never }).context });
    const apify = stub("instagram_apify", { status: "not_found" });
    const chain = createInstagramProviderChain([graph, apify]);
    const res = await chain.fetchProfile("empresa_teste");
    expect(res.status).toBe("ok");
    expect(apify.fetchProfile).not.toHaveBeenCalled();
  });

  it("cai do Graph para o gerenciado quando o alvo não é profissional", async () => {
    const graph = stub("instagram_graph", { status: "unavailable", reason: "not_professional" });
    const apify = stub("instagram_apify", { status: "ok", context: { provider: "instagram_apify" } as never });
    const chain = createInstagramProviderChain([graph, apify]);
    await chain.fetchProfile("pessoa");
    expect(apify.fetchProfile).toHaveBeenCalledOnce();
  });

  it("cai do gerenciado para o público em erro comum", async () => {
    const apify = stub("instagram_apify", { status: "unavailable", reason: "error" });
    const pub = stub("instagram_public", { status: "ok", context: { provider: "instagram_public" } as never });
    await createInstagramProviderChain([apify, pub]).fetchProfile("x");
    expect(pub.fetchProfile).toHaveBeenCalledOnce();
  });

  it("NÃO mascara problema grave de configuração nem rate limit", () => {
    expect(shouldTryNextProvider({ status: "unavailable", reason: "config_error" })).toBe(false);
    expect(shouldTryNextProvider({ status: "rate_limited" })).toBe(false);
    expect(shouldTryNextProvider({ status: "unavailable", reason: "blocked" })).toBe(true);
    expect(shouldTryNextProvider({ status: "not_found" })).toBe(true);
  });

  it("todos falham → último desfecho é propagado", async () => {
    const a = stub("instagram_apify", { status: "unavailable", reason: "error" });
    const b = stub("instagram_public", { status: "unavailable", reason: "blocked" });
    const res = await createInstagramProviderChain([a, b]).fetchProfile("x");
    expect(res).toEqual({ status: "unavailable", reason: "blocked" });
  });

  it("nunca chama providers simultaneamente", async () => {
    const order: string[] = [];
    const mk = (id: string, result: never) =>
      ({
        id,
        fetchProfile: async () => {
          order.push(`start:${id}`);
          await new Promise((r) => setTimeout(r, 5));
          order.push(`end:${id}`);
          return result;
        },
      }) as unknown as SocialProvider;
    await createInstagramProviderChain([
      mk("instagram_graph", { status: "not_found" } as never),
      mk("instagram_apify", { status: "not_found" } as never),
    ]).fetchProfile("x");
    expect(order).toEqual([
      "start:instagram_graph",
      "end:instagram_graph",
      "start:instagram_apify",
      "end:instagram_apify",
    ]);
  });
});

// ------------------------------------------------------------ health check
describe("health check", () => {
  it("reporta não configurado sem tocar na rede", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const h = await checkInstagramProviderHealth({}, fetchImpl);
    expect(h.graph).toEqual({ configured: false, status: "graph_unconfigured" });
    expect(h.managed).toEqual({ configured: false, status: "managed_unconfigured" });
    expect(h.publicRead.enabled).toBe(true);
    expect(h.chain).toEqual(["instagram_public"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("distingue disponível, token inválido, permissão e rate limit", async () => {
    const mk = async (body: unknown, status: number) =>
      checkInstagramProviderHealth(
        { INSTAGRAM_GRAPH_ACCESS_TOKEN: TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID: ACCOUNT },
        (async () => jsonResponse(body, status)) as never,
      );
    expect((await mk(GRAPH_OK, 200)).graph.status).toBe("graph_available");
    expect((await mk({ error: { code: 190 } }, 400)).graph.status).toBe("graph_invalid_token");
    expect((await mk({ error: { code: 200 } }, 403)).graph.status).toBe("graph_permission_error");
    expect((await mk({ error: { code: 4 } }, 400)).graph.status).toBe("graph_rate_limited");
    expect(
      (await mk({ error: { code: 100, error_subcode: 33, message: "Unknown path components" } }, 400))
        .graph.status,
    ).toBe("graph_invalid_business_account");
  });

  it("nunca devolve token nem resposta bruta", async () => {
    const h = await checkInstagramProviderHealth(
      {
        INSTAGRAM_GRAPH_ACCESS_TOKEN: TOKEN,
        INSTAGRAM_BUSINESS_ACCOUNT_ID: ACCOUNT,
        APIFY_API_TOKEN: "apify-secret",
      },
      (async () => jsonResponse(GRAPH_OK)) as never,
    );
    const dump = JSON.stringify(h);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain("apify-secret");
    expect(dump).not.toContain("biography");
  });
});

// ------------------------------------------------------------------- cache
describe("cache L1/L2 com a nova cadeia", () => {
  function makeStore() {
    const rows = new Map<string, SocialCacheRecord>();
    return {
      rows,
      read: vi.fn(async (network: string, handle: string) => rows.get(`${network}:${handle}`) ?? null),
      write: vi.fn(async (record: SocialCacheRecord) => {
        rows.set(`${record.network}:${record.normalized_handle}`, record);
      }),
    };
  }

  const analyzer = {
    model: "test-model",
    promptVersion: "v1",
    analyze: vi.fn(
      async () =>
        ({
          businessSummary: "Consultoria contábil para pequenas indústrias.",
          mainActivities: ["contabilidade"],
          productsServices: ["folha de pagamento"],
          targetAudiences: ["restaurantes"],
          commercialSignals: ["atende B2B"],
          differentiators: ["atendimento local"],
          keywords: ["contabilidade"],
          likelyOffers: ["serviços contábeis"],
          likelyNeeds: ["indicação de clientes"],
          confidence: 0.7,
          evidences: ["bio"],
        }) as never,
    ),
  };

  it("primeira consulta chama provider+IA; segunda não chama nada", async () => {
    const store = makeStore();
    const memory = createMemoryTtlCache<never>();
    const fetchImpl = vi.fn(async () => jsonResponse(GRAPH_OK)) as unknown as typeof fetch;
    const provider = createGraphInstagramProvider(TOKEN, ACCOUNT, fetchImpl);
    analyzer.analyze.mockClear();

    const deps = { provider, store, analyzer, memory } as never;
    const first = await runSocialEnrichment({ raw: "@empresa_teste", actor: "u1", deps });
    expect(first.status).toBe("ok");
    if (first.status === "ok") {
      expect(first.providerCalls).toBe(1);
      expect(first.aiCalls).toBe(1);
    }
    const second = await runSocialEnrichment({ raw: "@empresa_teste", actor: "u1", deps });
    if (second.status !== "ok") throw new Error("esperava ok");
    expect(second.providerCalls).toBe(0);
    expect(second.aiCalls).toBe(0);
    expect(second.source).toBe("memory");
    expect(store.write).toHaveBeenCalled();
  });

  it("L2 real: coleta vencida + conteúdo igual → provider 1, IA 0", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse(GRAPH_OK)) as unknown as typeof fetch;
    const provider = createGraphInstagramProvider(TOKEN, ACCOUNT, fetchImpl);
    analyzer.analyze.mockClear();

    let t = Date.parse("2026-01-01T00:00:00Z");
    const deps = { provider, store, analyzer, now: () => t } as never;
    await runSocialEnrichment({ raw: "@empresa_teste", actor: "u1", deps });
    expect(analyzer.analyze).toHaveBeenCalledTimes(1);

    t += 13 * 60 * 60 * 1000; // fetch TTL (12h) vencido
    const again = await runSocialEnrichment({ raw: "@empresa_teste", actor: "u1", deps });
    if (again.status !== "ok") throw new Error("esperava ok");
    expect(again.providerCalls).toBe(1);
    expect(again.aiCalls).toBe(0);
    expect(again.analysisReused).toBe(true);
  });
});

// ---------------------------------------------------------------------- UX
describe("UX do Continuar (etapa 2)", () => {
  it("sem @ não dispara enriquecimento", () => {
    expect(shouldRunSocialEnrichment("", null)).toBe(false);
    expect(shouldRunSocialEnrichment("   ", "empresa")).toBe(false);
  });

  it("mesmo @ já resolvido não dispara nova consulta (double click/reload)", () => {
    expect(shouldRunSocialEnrichment("@empresa", "empresa")).toBe(false);
    expect(shouldRunSocialEnrichment("https://www.instagram.com/empresa/", "empresa")).toBe(false);
    expect(shouldRunSocialEnrichment("EMPRESA", "empresa")).toBe(false);
  });

  it("@ alterado dispara novo contexto", () => {
    expect(shouldRunSocialEnrichment("@outra", "empresa")).toBe(true);
    expect(shouldRunSocialEnrichment("@empresa", null)).toBe(true);
  });
});
