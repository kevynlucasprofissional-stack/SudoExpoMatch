import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { heuristicSuggestionProvider } from "@/features/onboarding/suggestions";
import type { EventCatalog } from "@/features/participant/types";
import {
  AI_MODEL,
  PROMPT_VERSION,
  aiSuggestionResultSchema,
  buildAiRunInput,

  coerceNeedKind,
  modelOutputSchema,
  suggestOnboardingInputSchema,
  type AiSuggestionItem,
  type AiSuggestionResult,
  type SuggestOnboardingInput,
} from "./onboarding-ai-schema";
import {
  runOnboardingAi,
  type AiRunLogRow,
  type OrchestratorDeps,
} from "./onboarding-ai-orchestrator";

/** Fallback heurístico compartilhado (sem tocar no Gateway). */
async function fallbackToHeuristic(
  input: SuggestOnboardingInput,
  catalog: EventCatalog,
): Promise<AiSuggestionResult> {
  const items = await heuristicSuggestionProvider.suggest({
    segmentId: input.segmentId,
    summary: input.summary,
    catalog,
  });
  const offers: AiSuggestionItem[] = [];
  const needs: AiSuggestionItem[] = [];
  for (const s of items.items) {
    const item: AiSuggestionItem = {
      taxonomyItemId: s.taxonomyItemId,
      // IMPL 7: segmento vem do taxonomy item, nunca do perfil.
      segmentId: s.segmentId ?? null,
      label: s.label,
      kind: s.kind,
      // IMPL 6: needKind coerente com a própria sugestão heurística.
      ...(s.kind === "need" ? { needKind: coerceNeedKind(s.needKind) } : {}),
      confidence: s.confidence ?? 0.4,
    };
    if (s.kind === "offer" && offers.length < 5) offers.push(item);
    if (s.kind === "need" && needs.length < 5) needs.push(item);
  }
  return {
    understanding: {
      summary: input.summary.slice(0, 400),
      mainActivity: "",
      keywords: [],
      clarifyingQuestion: null,
    },
    offers,
    needs,
    source: "heuristic",
    promptVersion: PROMPT_VERSION,
  };
}

/**
 * Builder das deps de produção — usa Supabase (cache/rate/log) + Lovable AI Gateway.
 * Extraído para ser trivialmente substituível em testes.
 */
async function buildProductionDeps(apiKey: string | undefined): Promise<OrchestratorDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = supabaseAdmin;

  return {
    callGateway: async ({ prompt, timeoutMs }) => {
      if (!apiKey) throw new Error("HTTP 401 missing api key");
      const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway(AI_MODEL);
      const call = generateText({
        model,
        output: Output.object({ schema: modelOutputSchema }),
        prompt,
      });
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      });
      try {
        const gen = (await Promise.race([call, timeout])) as {
          output: unknown;
          usage?: { promptTokens?: number; completionTokens?: number };
        };
        return {
          output: gen.output,
          tokensInput: gen.usage?.promptTokens,
          tokensOutput: gen.usage?.completionTokens,
        };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
    readCache: async (key) => {
      // IMPL 23: o schema privado NÃO é acessível pela API — o acesso passa
      // por wrappers SECURITY DEFINER expostos só ao service_role.
      const { data, error } = await admin.rpc("ai_cache_lookup", {
        _key: key,
        _prompt_version: PROMPT_VERSION,
        _model: AI_MODEL,
      });
      if (error || !data) return null;
      // Defesa em profundidade — cache é validado de novo no orquestrador,
      // mas rejeitamos aqui também para nunca devolver JSON com shape
      // antigo/corrompido.
      const parsed = aiSuggestionResultSchema.safeParse(data);
      if (!parsed.success) return null;
      return parsed.data;
    },
    writeCache: async (key, value, ttlSec) => {
      await admin.rpc("ai_cache_store", {
        _key: key,
        _prompt_version: PROMPT_VERSION,
        _model: AI_MODEL,
        _result: value,
        _ttl_sec: ttlSec,
      });
    },
    consumeRateLimit: async (actor) => {
      const { data, error } = await admin.rpc("ai_rate_limit_consume", {
        _actor: actor,
        _window_sec: 300,
        _max_calls: 10,
      });
      // Fail-CLOSED: se o limitador em si falhar (erro de RPC ou resposta
      // com shape inválido), o orquestrador vai para fallback sem chamar
      // Gateway — evita gastar créditos sem controle.
      if (error) throw new Error(`limiter_rpc_error:${error.message ?? "unknown"}`);
      if (typeof data !== "boolean") {
        throw new Error(`limiter_invalid_response:${typeof data}`);
      }
      return data;
    },

    logRun: async (row: AiRunLogRow) => {
      try {
        await admin.from("ai_runs").insert({
          event_id: row.eventId,
          run_kind: "onboarding_suggest",
          input: buildAiRunInput(row.input, row.inputHash),

          output: {
            outcome: row.outcome,
            ...(typeof row.outputSummary === "object" && row.outputSummary
              ? (row.outputSummary as Record<string, unknown>)
              : {}),
          },
          model: row.model,
          latency_ms: row.latencyMs,
          succeeded: row.succeeded,
          error: row.error ?? null,
          actor_user_id: row.actorUserId,
          input_hash: row.inputHash,
          prompt_version: PROMPT_VERSION,
          tokens_input: row.tokensInput ?? null,
          tokens_output: row.tokensOutput ?? null,
          cache_hit: row.cacheHit,
          fallback_used: row.fallbackUsed,
        });
      } catch {
        // logs nunca podem quebrar o fluxo
      }
    },
    fallback: fallbackToHeuristic,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}

// ---------- Server function ----------
export const suggestOnboardingItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => suggestOnboardingInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<AiSuggestionResult> => {
    const userId = context.userId;

    // Catálogo real do banco (fonte de verdade da normalização).
    let catalogRaw: unknown = null;
    let catErr: unknown = null;
    try {
      const res = await context.supabase.rpc("list_event_segments_and_taxonomy", {
        _event_id: data.eventId,
      });
      catalogRaw = res.data;
      catErr = res.error;
    } catch (err) {
      catErr = err;
    }
    if (catErr || !catalogRaw) {
      // Sem catálogo, retornamos o heurístico e registramos um ai_run
      // seguro (sem summary bruto, sem detalhes do erro do banco).
      const fb = await fallbackToHeuristic(data, { segments: [], taxonomy: [] });
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await (
          supabaseAdmin as unknown as {
            from: (t: string) => { insert: (r: unknown) => Promise<unknown> };
          }
        )
          .from("ai_runs")
          .insert({
            event_id: data.eventId,
            run_kind: "onboarding_suggest",
            input: buildAiRunInput(data, "catalog_unavailable"),

            output: { outcome: "catalog_unavailable" },
            model: null,
            latency_ms: 0,
            succeeded: false,
            error: "catalog_unavailable",
            actor_user_id: userId,
            prompt_version: PROMPT_VERSION,
            cache_hit: false,
            fallback_used: true,
          });
      } catch {
        // Log é best-effort; nunca pode quebrar o fluxo do usuário.
      }
      return fb;
    }
    const catalog = catalogRaw as unknown as EventCatalog;

    const deps = await buildProductionDeps(process.env.LOVABLE_API_KEY);
    return runOnboardingAi({ input: data, catalog, actorUserId: userId, deps });
  });
