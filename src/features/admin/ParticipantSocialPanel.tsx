import { useState } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { refreshParticipantSocial } from "@/lib/social-context.functions";
import {
  analysisReasonLabel,
  computeSocialFreshness,
  freshnessLabel,
} from "@/features/social/cacheStatus";
import { Skeleton } from "@/components/ui/skeleton";
import {
  readStringList,
  readText,
  type ParticipantSocial,
} from "@/features/social/socialProfile";
import { translateAdminParticipantsError } from "@/features/admin/participantsSchemas";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

/**
 * Contexto social (Instagram) do participante — somente dados públicos
 * estruturados. Nunca exibe HTML bruto, token, cookie ou segredo: a RPC
 * administrativa só devolve os campos saneados no momento da coleta.
 */
export function ParticipantSocialPanel({
  query,
  profileId,
}: {
  query: UseQueryResult<ParticipantSocial, unknown>;
  profileId?: string | null;
}) {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshParticipantSocial);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function onRefresh() {
    if (!profileId || refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await refresh({ data: { profileId } });
      setRefreshMsg(
        res.ok
          ? "Contexto atualizado."
          : res.reason === "cooldown"
            ? "Atualizado há pouco. Tente novamente em alguns minutos."
            : res.reason === "no_handle"
              ? "Este participante não informou Instagram."
              : "Não foi possível atualizar agora.",
      );
      await qc.invalidateQueries({ queryKey: ["admin", "participant-social"] });
    } catch {
      setRefreshMsg("Não foi possível atualizar agora.");
    } finally {
      setRefreshing(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3" data-testid="social-loading">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="text-sm text-destructive">{translateAdminParticipantsError(query.error)}</p>
    );
  }
  const social = query.data?.social ?? null;
  if (!social) {
    return (
      <p className="text-sm text-muted-foreground">
        Este participante não informou Instagram no cadastro.
      </p>
    );
  }

  const ctx = social.context_snapshot ?? social.cache?.extracted_context ?? null;
  const pub = social.cache?.public_profile ?? null;
  const analysis = social.analysis_snapshot ?? social.cache?.ai_analysis ?? null;
  const keywords = readStringList(ctx, "keywords");
  const signals = readStringList(ctx, "signals");
  const displayName = readText(ctx, "display_name") ?? readText(pub, "display_name");
  const category = readText(ctx, "category") ?? readText(pub, "category");
  const bio = readText(ctx, "bio") ?? readText(pub, "bio");
  const website = readText(ctx, "website") ?? readText(pub, "website");
  const freshness = computeSocialFreshness(social.cache ?? null);
  const followers = (ctx as Record<string, unknown> | null)?.["followers_count"];
  const media = (ctx as Record<string, unknown> | null)?.["media_count"];

  return (
    <div className="space-y-4 text-sm" data-testid="social-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">@{social.handle}</span>
        {social.canonical_url && (
          <a
            href={social.canonical_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs underline underline-offset-2"
          >
            abrir no Instagram
          </a>
        )}
        <Badge variant="outline">{social.cache?.provider ?? "informado pelo participante"}</Badge>
        <Badge variant="secondary">{social.cache?.last_status ?? "informed"}</Badge>
        {profileId && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="social-refresh"
          >
            {refreshing ? "Atualizando…" : "Atualizar contexto"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="social-freshness">
        <Badge variant={freshness.fetch === "fresh" ? "secondary" : "outline"}>
          coleta: {freshnessLabel(freshness.fetch)}
        </Badge>
        <Badge variant={freshness.analysis === "fresh" ? "secondary" : "outline"}>
          análise: {freshnessLabel(freshness.analysis)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {analysisReasonLabel(freshness.analysisReason)}
        </span>
      </div>
      {refreshMsg && <p className="text-xs text-muted-foreground">{refreshMsg}</p>}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Nome público</dt>
          <dd>{displayName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Categoria</dt>
          <dd>{category ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Website</dt>
          <dd>{website ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Seguidores / publicações</dt>
          <dd>
            {typeof followers === "number" ? followers : "—"} /{" "}
            {typeof media === "number" ? media : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Coletado em</dt>
          <dd>{fmt(social.cache?.fetched_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Analisado em</dt>
          <dd>{fmt(social.cache?.analyzed_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Última atualização</dt>
          <dd>{fmt(social.updated_at ?? social.linked_at)}</dd>
        </div>
      </dl>

      <div>
        <p className="text-xs text-muted-foreground">Bio pública</p>
        <p className="mt-1 whitespace-pre-wrap">{bio ?? "—"}</p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Palavras-chave</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {keywords.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            keywords.map((k) => (
              <Badge key={k} variant="secondary">
                {k}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Sinais comerciais</p>
        <ul className="mt-1 list-disc pl-5">
          {signals.length === 0 ? (
            <li className="list-none text-muted-foreground">—</li>
          ) : (
            signals.map((s) => <li key={s}>{s}</li>)
          )}
        </ul>
      </div>

      {analysis && (
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Análise de IA {social.cache?.ai_model ? `· ${social.cache.ai_model}` : ""}
          </p>
          <ul className="mt-1 list-disc pl-5">
            {Object.entries(analysis)
              .slice(0, 12)
              .map(([k, v]) => (
                <li key={k}>
                  <span className="text-muted-foreground">{k}: </span>
                  {typeof v === "string" || typeof v === "number"
                    ? String(v)
                    : Array.isArray(v)
                      ? v.filter((i) => typeof i === "string").join(", ")
                      : "—"}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
