import { createSocialAnalyzer } from "@/lib/social-cache.server";
const a = createSocialAnalyzer(process.env.LOVABLE_API_KEY)!;
const ctx = { provider:"instagram_apify", handle:"natura", displayName:"Natura", bio:"Cosméticos naturais e sustentáveis", keywords:["beleza","cosmeticos"], signals:[], followersCount:100, followsCount:10, mediaCount:20, recentCaptions:["novo hidratante vegano"] } as any;
const r = await a.analyze(ctx);
console.log("analysis:", JSON.stringify(r));
