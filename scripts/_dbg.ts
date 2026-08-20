import { resolveInstagramProvider } from "@/lib/instagram-provider.server";
import { createSocialAnalyzer } from "@/lib/social-cache.server";
const p = resolveInstagramProvider(process.env as never);
const r: any = await p.fetchProfile("natura");
console.log("fetch status", r.status, r.provider ?? r.context?.provider);
const a = createSocialAnalyzer(process.env.LOVABLE_API_KEY)!;
const t = Date.now();
const out = await a.analyze(r.context);
console.log("elapsed", Date.now()-t, "analysis null?", out === null, JSON.stringify(out).slice(0,200));
