import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { AI_MODEL } from "@/lib/onboarding-ai-schema";
import { buildSocialAnalysisPrompt, socialBusinessAnalysisSchema, sanitizeSocialAnalysis } from "@/lib/social-analysis";
const gateway = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
const ctx = { provider:"instagram_apify", handle:"natura", displayName:"Natura", bio:"Cosméticos naturais e sustentáveis", keywords:["beleza"], signals:[], followersCount:100, followsCount:10, mediaCount:20, recentCaptions:["novo hidratante vegano"] } as any;
try {
  const gen = await generateText({ model: gateway(AI_MODEL), output: Output.object({ schema: socialBusinessAnalysisSchema }), prompt: buildSocialAnalysisPrompt(ctx) });
  console.log("RAW OUTPUT:", JSON.stringify(gen.output));
  console.log("SANITIZED:", JSON.stringify(sanitizeSocialAnalysis(gen.output)));
} catch (e) { console.log("ERR:", (e as Error).message.slice(0,500)); }
