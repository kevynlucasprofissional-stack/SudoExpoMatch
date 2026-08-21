import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildSocialAnalysisPrompt, socialAnalysisGenerationSchema, sanitizeSocialAnalysis } from "@/lib/social-analysis";
import { extractKeywords, extractSignals } from "@/lib/social-context";

const gw = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
const MODEL = "google/gemini-2.5-flash";
const files = ["cacaushow","oticaswanny","padariabrasileira","oboticario","supermercadosbh","lojasrenner"];

function ctxFor(item: any, n: number) {
  const posts = (item.latestPosts ?? []).slice(0, n).map((p: any) => ({
    mediaType: String(p.type ?? "OTHER").toUpperCase(),
    caption: typeof p.caption === "string" ? p.caption.slice(0, 200) : undefined,
    timestamp: p.timestamp,
    permalink: p.url,
    hashtags: p.hashtags ?? [],
  }));
  const text = [item.fullName, item.businessCategoryName, item.biography, ...posts.map((p: any) => p.caption ?? "")].filter(Boolean).join(". ");
  return {
    provider: "instagram_apify", handle: item.username, displayName: item.fullName,
    category: item.businessCategoryName, bio: item.biography, website: item.externalUrl,
    followersCount: item.followersCount, mediaCount: item.postsCount,
    keywords: extractKeywords(text), signals: extractSignals(text),
    recentMedia: posts, fetchedAt: new Date().toISOString(), truncated: false,
  } as any;
}

const rows: any[] = [];
for (const f of files) {
  const item = JSON.parse(await Bun.file(`/tmp/apify/${f}.json`).text())[0];
  for (const n of [0, 3, 6, 9]) {
    const prompt = buildSocialAnalysisPrompt(ctxFor(item, n));
    const t0 = Date.now();
    try {
      const gen: any = await generateText({ model: gw(MODEL), output: Output.object({ schema: socialAnalysisGenerationSchema }), prompt });
      const a = sanitizeSocialAnalysis(gen.output);
      rows.push({ perfil: f, n, ok: !!a, ofertas: a?.likelyOffers.length ?? 0, necessidades: a?.likelyNeeds.length ?? 0,
        atividades: a?.mainActivities.length ?? 0, produtos: a?.productsServices.length ?? 0,
        conf: a?.confidence ?? 0, tokIn: gen.usage?.inputTokens ?? 0, tokOut: gen.usage?.outputTokens ?? 0, ms: Date.now() - t0,
        resumo: (a?.businessSummary ?? "").slice(0, 110) });
    } catch (e: any) {
      rows.push({ perfil: f, n, ok: false, err: String(e?.message ?? e).slice(0, 80), ms: Date.now() - t0 });
    }
  }
}
console.table(rows);
await Bun.write("/tmp/apify/experiment.json", JSON.stringify(rows, null, 2));
const by: Record<number, any> = {};
for (const r of rows) { const b = (by[r.n] ??= { n: r.n, ok: 0, ofertas: 0, nec: 0, conf: 0, tokIn: 0, ms: 0, c: 0 });
  b.c++; b.ok += r.ok ? 1 : 0; b.ofertas += r.ofertas ?? 0; b.nec += r.necessidades ?? 0; b.conf += r.conf ?? 0; b.tokIn += r.tokIn ?? 0; b.ms += r.ms; }
console.table(Object.values(by).map((b: any) => ({ n: b.n, sucesso: `${b.ok}/${b.c}`, ofertasMed: (b.ofertas/b.c).toFixed(2), necMed: (b.nec/b.c).toFixed(2), confMed: (b.conf/b.c).toFixed(2), tokInMed: Math.round(b.tokIn/b.c), msMed: Math.round(b.ms/b.c) })));
