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

interface SafeBriefingView {
  summary: string;
  my_side: string[];
  evidence: Array<{ label: string; source: string }>;
  approach: string | null;
  generated_at: string;
  stale: boolean;
}

/**
 * IMPL 31 (hardening) — geração do briefing OFICIAL pelo próprio participante.
 *
 * Toda a autorização acontece em pontes SERVER-ONLY (service role):
 * `service_participant_briefing_context` e `service_participant_save_briefing`.
 * Elas recebem o ator explicitamente e revalidam: match existe, está ativo, é
 * do evento correto, o perfil não-demo do ator é uma das duas pontas e o match
 * está no Top 3 canônico (mesma ordenação exibida na tela). As RPCs internas
 * NÃO são executáveis por `authenticated` — o cliente nunca escreve em
 * `match_briefings` por fora deste caminho, e nenhum service role vai ao browser.
 *
 * Ordem obrigatória: autorização → reuso de briefing atual → rate limit
 * (fail closed) → chamada paga ao modelo → persistência.
 */
export const generateOwnMatchBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => matchBriefingInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("ai_unavailable");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;

    // 1) AUTORIZAÇÃO primeiro — antes de consumir qualquer quota.
    const ctxRes = await admin.rpc("service_participant_briefing_context", {
      _match_id: data.matchId,
      _actor_user_id: context.userId,
    });
    if (ctxRes.error || !ctxRes.data) {
      throw new Error(ctxRes.error?.message ?? "briefing_context_unavailable");
    }
    const authorized = ctxRes.data as {
      existing: SafeBriefingView | null;
      dossier: unknown;
    };

    // 2) Briefing oficial atual (não-stale) é REUTILIZADO: zero token gasto.
    const existing = authorized.existing;
    if (existing && existing.stale === false) {
      return {
        match_id: data.matchId,
        summary: existing.summary,
        my_side: Array.isArray(existing.my_side) ? existing.my_side : [],
        evidence: Array.isArray(existing.evidence) ? existing.evidence : [],
        approach: existing.approach ?? null,
        generated_at: existing.generated_at,
        stale: false,
        reused: true,
      };
    }

    // 3) Rate limit FAIL CLOSED: falha do limitador impede a chamada paga.
    const limit = await context.supabase.rpc("ai_rate_limit_consume", {
      _actor: context.userId,
      _window_sec: PARTICIPANT_RATE_WINDOW_SEC,
      _max_calls: PARTICIPANT_RATE_MAX_CALLS,
    });
    if (limit.error) throw new Error("ai_unavailable");
    if (limit.data === false) throw new Error("ai_rate_limited");

    const dossier = authorized.dossier as MatchDossier;

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
    const saved = await admin.rpc("service_participant_save_briefing", {
      _match_id: data.matchId,
      _actor_user_id: context.userId,
      _payload: payload,
    });
    if (saved.error) throw new Error(saved.error.message);

    // Telemetria best-effort — nunca quebra o fluxo do participante.
    try {
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
      reused: false,
    };
  });
