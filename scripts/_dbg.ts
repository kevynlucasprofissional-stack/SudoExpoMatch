import { resolveInstagramProvider } from "@/lib/instagram-provider.server";
import { createSocialAnalyzer } from "@/lib/social-cache.server";
const p = resolveInstagramProvider(process.env as never);
const r: any = await p.fetchProfile("natura");
console.log("fetch status", r.status, r.provider ?? r.context?.provider);
const a = createSocialAnalyzer(process.env.LOVABLE_API_KEY)!;
const t = Date.now();
import("ai").then(()=>{});
const { generateText, Output } = await import("ai");
const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
const { AI_MODEL } = await import("@/lib/onboarding-ai-schema");
const { buildSocialAnalysisPrompt, socialBusinessAnalysisSchema, sanitizeSocialAnalysis } = await import("@/lib/social-analysis");
const gw = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
let out: any = null;
try {
  const gen = await generateText({ model: gw(AI_MODEL), output: Output.object({ schema: socialBusinessAnalysisSchema }), prompt: buildSocialAnalysisPrompt(r.context) });
  console.log("raw:", JSON.stringify(gen.output).slice(0,300));
  out = sanitizeSocialAnalysis(gen.output);
} catch (e) { console.log("ERR", (e as Error).message.slice(0,600)); }
console.log("elapsed", Date.now()-t, "analysis null?", out === null, JSON.stringify(out).slice(0,200));
