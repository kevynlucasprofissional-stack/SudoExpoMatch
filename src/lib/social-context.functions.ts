import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  runSocialEnrichment,
  type SocialEnrichmentResult,
  type SocialEntry,
} from "./social-enrichment";
import { createMemoryTtlCache, type TtlCache } from "./social-context";

export const analyzeSocialProfileInputSchema = z.object({
  input: z.string().trim().min(1).max(300),
  /** Ignora L1/L2 e reconsulta o provider (usado pelo painel admin). */
  force: z.boolean().optional(),
});

// L1 — cache de processo do Edge Worker (descartável).
let memoryRef: TtlCache<SocialEntry> | null = null;
function socialMemory(): TtlCache<SocialEntry> {
  if (!memoryRef) memoryRef = createMemoryTtlCache<SocialEntry>();
  return memoryRef;
}

/** Monta as dependências reais do pipeline cache-first (server-only). */
async function buildEnrichmentDeps() {
  const { resolveInstagramProvider, socialRateLimiter } = await import(
    "./instagram-provider.server"
  );
  const { createSocialAnalyzer, createSupabaseSocialCacheStore, socialConfigFromEnv } =
    await import("./social-cache.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    provider: resolveInstagramProvider({
      INSTAGRAM_GRAPH_ACCESS_TOKEN: process.env["INSTAGRAM_GRAPH_ACCESS_TOKEN"],
      INSTAGRAM_BUSINESS_ACCOUNT_ID: process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"],
      INSTAGRAM_PUBLIC_READ_DISABLED: process.env["INSTAGRAM_PUBLIC_READ_DISABLED"],
    }),
    memory: socialMemory(),
    store: createSupabaseSocialCacheStore(
      supabaseAdmin as unknown as Parameters<typeof createSupabaseSocialCacheStore>[0],
    ),
    analyzer: createSocialAnalyzer(process.env["LOVABLE_API_KEY"]),
    rateLimiter: socialRateLimiter(),
    config: socialConfigFromEnv(),
  };
}

/**
 * Enriquecimento opcional por Instagram (cache-first: memória → banco →
 * provider). Nunca lança para o cliente: qualquer falha vira um desfecho
 * tratável e o cadastro segue normalmente. Conteúdo bruto (HTML/posts)
 * nunca sai daqui nem vai para log.
 */
export const analyzeSocialProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyzeSocialProfileInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SocialEnrichmentResult> => {
    try {
      return await runSocialEnrichment({
        raw: data.input,
        actor: context.userId,
        deps: await buildEnrichmentDeps(),
      });
    } catch {
      return { status: "unavailable", reason: "error" };
    }
  });

export const refreshParticipantSocialInputSchema = z.object({
  profileId: z.string().uuid(),
});

/**
 * "Atualizar contexto" do painel administrativo: força nova coleta e,
 * se o conteúdo mudou, nova análise. O gate de administrador e o
 * cooldown ficam no banco (`service_refresh_profile_social`).
 */
export const refreshParticipantSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => refreshParticipantSocialInputSchema.parse(data))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; reason?: string; result?: SocialEnrichmentResult }> => {
      // 1) Autorização + cooldown + auditoria são decididos no banco, com o
      //    auth.uid() do chamador (nunca com service_role).
      const { data: gate, error } = await context.supabase.rpc("service_refresh_profile_social", {
        _profile_id: data.profileId,
      });
      const row = gate as { allowed?: boolean; handle?: string | null; reason?: string } | null;
      if (error || !row?.allowed) {
        return { ok: false, reason: row?.reason ?? "not_allowed" };
      }
      if (!row.handle) return { ok: false, reason: "no_handle" };

      try {
        const result = await runSocialEnrichment({
          raw: row.handle,
          actor: context.userId,
          force: true,
          deps: await buildEnrichmentDeps(),
        });
        return { ok: result.status === "ok", result };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  );
