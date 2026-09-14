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

/** Proteção de crédito: no máximo 5 gerações por participante a cada 10 min. */
const PARTICIPANT_RATE_WINDOW_SEC = 600;
const PARTICIPANT_RATE_MAX_CALLS = 5;

/**
 * IMPL 31 — geração do briefing OFICIAL pelo próprio participante.
 *
 * A autorização real vive no banco: `participant_get_match_dossier` e
 * `participant_save_match_briefing` só aceitam o dono de uma das duas pontas
 * de um match ATIVO e apenas para o Top 3 da ordem canônica. A UI é
 * conveniência, nunca o controle de acesso.
 *
 * O resultado é persistido em `public.match_briefings` — a mesma fonte que o
 * painel administrativo usa, para que equipe e participante falem a mesma língua.
 */
export const generateOwnMatchBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => matchBriefingInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("ai_unavailable");

    // Rate limit por ator antes de qualquer chamada paga.
    const limit = await context.supabase.rpc("ai_rate_limit_consume", {
      _actor: context.userId,
      _window_sec: PARTICIPANT_RATE_WINDOW_SEC,
      _max_calls: PARTICIPANT_RATE_MAX_CALLS,
    });
    if (!limit.error && limit.data === false) throw new Error("ai_rate_limited");

    const dossierRes = await context.supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "participant_get_match_dossier" as any,
      { _match_id: data.matchId },
    );
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
    const saved = await context.supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "participant_save_match_briefing" as any,
      { _match_id: data.matchId, _payload: payload },
    );
    if (saved.error) throw new Error(saved.error.message);

    // Telemetria best-effort — nunca quebra o fluxo do participante.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (
        supabaseAdmin as unknown as {
          from: (t: string) => { insert: (r: unknown) => Promise<unknown> };
        }
      )
        .from("ai_runs")
        .insert({
          run_kind: "participant_match_briefing",
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

    const row = (saved.data ?? {}) as { generated_at?: string; my_side?: unknown };
    return {
      match_id: data.matchId,
      summary: payload.summary,
      my_side: Array.isArray(row.my_side) ? (row.my_side as string[]) : [],
      evidence: payload.evidence,
      approach: payload.approach,
      generated_at: row.generated_at ?? new Date().toISOString(),
      stale: false,
    };
  });
