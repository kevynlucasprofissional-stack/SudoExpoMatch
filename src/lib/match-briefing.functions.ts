import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  MATCH_BRIEFING_MODEL,
  MATCH_BRIEFING_PROMPT_VERSION,
  briefingModelSchema,
  buildBriefingPrompt,
  matchBriefingInputSchema,
  toBriefingPayload,
  type MatchDossier,
} from "@/lib/match-briefing";

/**
 * Gera a "leitura comercial" de um match (por que conectar) a partir do dossiê
 * montado no banco e persiste o resultado em match_briefings.
 */
export const generateMatchBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => matchBriefingInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("ai_unavailable");
    }

    const dossierRes = await context.supabase.rpc("admin_get_match_dossier", {
      _match_id: data.matchId,
    });
    if (dossierRes.error || !dossierRes.data) {
      throw new Error(dossierRes.error?.message ?? "dossier_unavailable");
    }
    const dossier = dossierRes.data as unknown as MatchDossier;

    const started = Date.now();
    const provider = createLovableAiGatewayProvider(apiKey);
    let output: unknown;
    try {
      const gen = await generateText({
        model: provider(MATCH_BRIEFING_MODEL),
        output: Output.object({ schema: briefingModelSchema }),
        prompt: buildBriefingPrompt(dossier),
      });
      output = (gen as unknown as { output: unknown }).output;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402/.test(msg)) throw new Error("ai_credits");
      if (/403/.test(msg)) throw new Error("ai_blocked");
      if (/429/.test(msg)) throw new Error("ai_rate_limited");
      throw new Error("ai_failed");
    }

    const parsed = briefingModelSchema.safeParse(output);
    if (!parsed.success) throw new Error("ai_invalid_output");

    const payload = toBriefingPayload(parsed.data, MATCH_BRIEFING_MODEL);
    const saved = await context.supabase.rpc("admin_save_match_briefing", {
      _match_id: data.matchId,
      _payload: payload,
    });
    if (saved.error) throw new Error(saved.error.message);

    // Telemetria best-effort — nunca quebra o fluxo da equipe.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (
        supabaseAdmin as unknown as {
          from: (t: string) => { insert: (r: unknown) => Promise<unknown> };
        }
      )
        .from("ai_runs")
        .insert({
          run_kind: "match_briefing",
          input: { match_id: data.matchId },
          output: { outcome: "ok" },
          model: MATCH_BRIEFING_MODEL,
          latency_ms: Date.now() - started,
          succeeded: true,
          actor_user_id: context.userId,
          prompt_version: MATCH_BRIEFING_PROMPT_VERSION,
          cache_hit: false,
          fallback_used: false,
        });
    } catch {
      // ignorado de propósito
    }

    const row = (saved.data ?? {}) as { generated_at?: string };
    return {
      match_id: data.matchId,
      summary: payload.summary,
      sides: payload.sides,
      evidence: payload.evidence,
      risks: payload.risks,
      approach: payload.approach,
      source: payload.source,
      model: payload.model,
      generated_at: row.generated_at ?? new Date().toISOString(),
      stale: false,
    };
  });
