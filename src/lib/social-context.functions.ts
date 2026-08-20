import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runSocialLookup, type SocialLookupResult } from "./social-context";

export const analyzeSocialProfileInputSchema = z.object({
  input: z.string().trim().min(1).max(300),
});

/**
 * Enriquecimento opcional por Instagram. Nunca lança para o cliente:
 * qualquer falha vira um desfecho tratável e o cadastro segue normalmente.
 * Conteúdo bruto (HTML/posts) nunca sai daqui nem vai para log.
 */
export const analyzeSocialProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyzeSocialProfileInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SocialLookupResult> => {
    const { resolveInstagramProvider, socialCache, socialRateLimiter } = await import(
      "./instagram-provider.server"
    );
    return runSocialLookup({
      raw: data.input,
      actor: context.userId,
      provider: resolveInstagramProvider({
        INSTAGRAM_GRAPH_ACCESS_TOKEN: process.env["INSTAGRAM_GRAPH_ACCESS_TOKEN"],
        INSTAGRAM_BUSINESS_ACCOUNT_ID: process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"],
        INSTAGRAM_PUBLIC_READ_DISABLED: process.env["INSTAGRAM_PUBLIC_READ_DISABLED"],
      }),
      cache: socialCache(),
      rateLimiter: socialRateLimiter(),
    });
  });
