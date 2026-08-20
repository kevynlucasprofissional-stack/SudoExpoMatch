import { generateText, Output } from "ai";
import { resolveSocialConfig } from "@/config/social";
import { AI_MODEL } from "./onboarding-ai-schema";
import {
  SOCIAL_ANALYSIS_PROMPT_VERSION,
  buildSocialAnalysisPrompt,
  sanitizeSocialAnalysis,
  socialBusinessAnalysisSchema,
} from "./social-analysis";
import type { SocialAnalyzer, SocialCacheRecord, SocialCacheStore } from "./social-enrichment";

/**
 * Ligações server-only do enriquecimento social: cache L2 no banco
 * (RPCs `service_role`) e analisador de IA via Lovable AI Gateway.
 *
 * Nada aqui pode ser importado pelo cliente — o arquivo é `.server.ts`.
 */

const SOCIAL_ANALYSIS_TIMEOUT_MS = 12_000;

/** Cache L2 persistente (private.social_profile_cache) via RPC autorizada. */
export function createSupabaseSocialCacheStore(admin: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}): SocialCacheStore {
  return {
    async read(network, handle) {
      const { data, error } = await admin.rpc("social_cache_lookup", {
        _network: network,
        _handle: handle,
      });
      if (error || !data || typeof data !== "object") return null;
      return data as SocialCacheRecord;
    },
    async write(record) {
      await admin.rpc("social_cache_store", {
        _network: record.network,
        _handle: record.normalized_handle,
        _canonical_url: record.canonical_url,
        _provider: record.provider,
        _public_profile: record.public_profile ?? {},
        _extracted_context: record.extracted_context ?? {},
        _ai_analysis: record.ai_analysis,
        _content_fingerprint: record.content_fingerprint,
        _ai_prompt_version: record.ai_prompt_version,
        _ai_model: record.ai_model,
        _fetched_at: record.fetched_at,
        _analyzed_at: record.analyzed_at,
        _expires_at: record.expires_at,
        _last_status: record.last_status ?? "ok",
        _last_error_code: record.last_error_code,
      });
    },
  };
}

/** Analisador de IA do perfil público. Retorna `null` em qualquer falha. */
export function createSocialAnalyzer(apiKey: string | undefined): SocialAnalyzer | undefined {
  if (!apiKey) return undefined;
  return {
    model: AI_MODEL,
    promptVersion: SOCIAL_ANALYSIS_PROMPT_VERSION,
    async analyze(ctx) {
      const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
      const gateway = createLovableAiGatewayProvider(apiKey);
      const call = generateText({
        model: gateway(AI_MODEL),
        output: Output.object({ schema: socialBusinessAnalysisSchema }),
        prompt: buildSocialAnalysisPrompt(ctx),
      });
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), SOCIAL_ANALYSIS_TIMEOUT_MS);
      });
      try {
        const gen = (await Promise.race([call, timeout])) as { output: unknown };
        return sanitizeSocialAnalysis(gen.output);
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/** Config efetiva do enriquecimento (com overrides de ambiente). */
export function socialConfigFromEnv() {
  return resolveSocialConfig(process.env as Record<string, string | undefined>);
}
