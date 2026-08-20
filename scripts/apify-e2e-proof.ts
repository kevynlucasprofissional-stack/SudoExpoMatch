import { createClient } from "@supabase/supabase-js";
import { resolveInstagramProvider } from "@/lib/instagram-provider.server";
import { createSupabaseSocialCacheStore, createSocialAnalyzer } from "@/lib/social-cache.server";
import { runSocialEnrichment } from "@/lib/social-enrichment";
import { createMemoryTtlCache } from "@/lib/social-context";

const handle = process.argv[2] ?? "acirvrioverde";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let providerCalls = 0;
const countingFetch: typeof fetch = (input, init) => {
  if (String(input).includes("apify")) providerCalls++;
  return fetch(input as never, init);
};
const provider = resolveInstagramProvider(process.env as never, countingFetch);
const store = createSupabaseSocialCacheStore(admin as never);
const analyzer = createSocialAnalyzer(process.env.LOVABLE_API_KEY);
console.log("provider =", provider.id, "| analyzer =", analyzer ? analyzer.model : "none");

const memory = createMemoryTtlCache<any>(50);
const deps = { provider, memory, store, analyzer } as any;

const first = await runSocialEnrichment({ raw: handle, actor: "proof", force: true, deps });
console.log("1a) status", first.status, JSON.stringify(first).slice(0, 700));

// segunda consulta: memória limpa, obriga a passar pelo L2
const deps2 = { provider, memory: createMemoryTtlCache<any>(50), store, analyzer } as any;
const before = providerCalls;
const second = await runSocialEnrichment({ raw: handle, actor: "proof", deps: deps2 });
console.log("2a) source", (second as any).source, "providerCalls(delta)", providerCalls - before,
  "aiCalls", (second as any).aiCalls, "analysisReused", (second as any).analysisReused);

const raw = await admin.rpc("social_cache_lookup", { _network: "instagram", _handle: handle });
console.log("L2 raw:", JSON.stringify(raw).slice(0, 900));
