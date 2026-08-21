import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Provider do Lovable AI Gateway.
 *
 * CAUSA B do diagnóstico forense: com `supportsStructuredOutputs: false` o AI
 * SDK envia `response_format: json_object` e o schema NÃO é aplicado — todas
 * as chamadas de onboarding falhavam com "response did not match schema".
 * O padrão agora é structured output LIGADO (strict `json_schema`).
 */
export function createLovableAiGatewayProvider(
  lovableApiKey: string,
  options?: { structuredOutputs?: boolean },
) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: options?.structuredOutputs ?? true,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}
