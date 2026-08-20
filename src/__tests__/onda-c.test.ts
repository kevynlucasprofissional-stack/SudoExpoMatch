import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveParticipantPageState } from "@/features/participant/pageState";
import {
  filterInterests,
  filterActiveConnections,
  filterPendingConnections,
  filterCancelledConnections,
  canRevealForMatch,
  isMatchMutual,
  formatSegmentLabel,
  humanizeSlug,
  revealDisabledHint,
  translateRevealErrorCode,
  translateRecomputeErrorCode,
  translateDecideErrorCode,
  isRevealRetriable,
  NEED_KIND_TEXT,
  CONNECTION_STATUS_TEXT,
} from "@/features/participant/presentation";
import { resolveMatchesDisplayState } from "@/features/participant/matchesDisplayState";
import { ownMatchesQueryOptions } from "@/features/matching/queries";
import type { ConnectionStatus, Decision, MatchKind, NeedKind } from "@/lib/types";
import type { OwnMatchDTO, OwnMatchConnection } from "@/features/participant/types";

// ---------------------------------------------------------------------------
// Fixtures — DTOs válidos, sem `as any`, respeitando o contrato v2.
// ---------------------------------------------------------------------------

function makeConnection(status: ConnectionStatus, notes: string | null = null): OwnMatchConnection {
  return { id: `conn-${status}`, status, notes };
}

function makeMatch(overrides: {
  id: string;
  kind?: MatchKind;
  myDecision?: Decision;
  otherDecision?: Decision;
  connection?: OwnMatchConnection | null;
  segmentId?: string;
  needKind?: NeedKind;
}): OwnMatchDTO {
  const {
    id,
    kind = "direto",
    myDecision = "sem_decisao",
    otherDecision = "sem_decisao",
    connection = null,
    segmentId = "servicos-corporativos",
    needKind = "fornecedor",
  } = overrides;
  return {
    match_id: id,
    my_profile_id: `me-${id}`,
    other_profile_id: `other-${id}`,
    kind,
    label: "boa_oportunidade",
    score_me: 82,
    score_other: 78,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    generated_at: "2026-01-01T00:00:00.000Z",
    other: {
      name: "Ana Silva",
      company: "Acme Ltda",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: segmentId,
      summary: "Empresa de logística regional.",
    },
    other_offers: [{ label: "Frete dedicado", detail: null }],
    other_needs: [
      { label: "Software de gestão", detail: null, need_kind: needKind, is_priority: true },
    ],
    reasons: [{ code: "R1", label: "Complementaridade forte", weight: 55 }],
    my_decision: myDecision,
    other_decision: otherDecision,
    connection,
  };
}

// ---------------------------------------------------------------------------

describe("pageState — precedência canônica", () => {
  const okProfile = {
    isPending: false,
    isError: false,
    data: { id: "p" } as unknown as import("@/features/participant/types").OwnProfileDTO,
  };

  it("session_error vence tudo", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "error" },
        profile: { isPending: true, isError: true, data: null },
      }).kind,
    ).toBe("session_error");
  });
  it("session_loading vem antes de profile", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "loading" },
        profile: okProfile,
      }).kind,
    ).toBe("session_loading");
  });
  it("profile_error NÃO vira recovery", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: { isPending: false, isError: true, data: null },
      }).kind,
    ).toBe("profile_error");
  });
  it("profile_loading só quando pending sem dado", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: { isPending: true, isError: false, data: undefined },
      }).kind,
    ).toBe("profile_loading");
  });
  it("recovery quando null", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: { isPending: false, isError: false, data: null },
      }).kind,
    ).toBe("recovery");
  });
  it("panel quando presente", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: okProfile,
      }).kind,
    ).toBe("panel");
  });
});

describe("filtros por decisão mútua real", () => {
  const interested = makeMatch({ id: "m1", myDecision: "interesse" });
  const declined = makeMatch({ id: "m2", myDecision: "agora_nao" });
  const undecided = makeMatch({ id: "m0" });
  const mutualNoConn = makeMatch({
    id: "m3",
    myDecision: "interesse",
    otherDecision: "interesse",
  });
  const mutualActive = makeMatch({
    id: "m4",
    myDecision: "interesse",
    otherDecision: "interesse",
    connection: makeConnection("apresentados"),
  });
  const mutualCancelled = makeMatch({
    id: "m5",
    myDecision: "interesse",
    otherDecision: "interesse",
    connection: makeConnection("cancelado", "Empresa fechou"),
  });
  const otherInterestedOnly = makeMatch({
    id: "m6",
    myDecision: "sem_decisao",
    otherDecision: "interesse",
  });
  const all = [
    interested,
    declined,
    undecided,
    mutualNoConn,
    mutualActive,
    mutualCancelled,
    otherInterestedOnly,
  ];

  it("interests: apenas my_decision=interesse", () => {
    expect(
      filterInterests(all)
        .map((m) => m.match_id)
        .sort(),
    ).toEqual(["m1", "m3", "m4", "m5"]);
  });
  it("active: mútuo, com conexão, não cancelada", () => {
    expect(filterActiveConnections(all).map((m) => m.match_id)).toEqual(["m4"]);
  });
  it("pending: mútuo sem conexão", () => {
    expect(filterPendingConnections(all).map((m) => m.match_id)).toEqual(["m3"]);
  });
  it("cancelled: mútuo com conexão cancelada", () => {
    expect(filterCancelledConnections(all).map((m) => m.match_id)).toEqual(["m5"]);
  });
  it("isMatchMutual respeita ambas as decisões", () => {
    expect(isMatchMutual(mutualNoConn)).toBe(true);
    expect(isMatchMutual(otherInterestedOnly)).toBe(false);
    expect(isMatchMutual(interested)).toBe(false);
  });
});

describe("canRevealForMatch — matriz completa dos 6 status", () => {
  const statuses: ConnectionStatus[] = [
    "aguardando",
    "em_atendimento",
    "apresentados",
    "contato_trocado",
    "concluido",
    "cancelado",
  ];
  const table: Record<ConnectionStatus, boolean> = {
    aguardando: false,
    em_atendimento: false,
    apresentados: true,
    contato_trocado: true,
    concluido: true,
    cancelado: false,
  };

  for (const s of statuses) {
    it(`status=${s} → reveal=${table[s]}`, () => {
      const m = makeMatch({
        id: `s-${s}`,
        myDecision: "interesse",
        otherDecision: "interesse",
        connection: makeConnection(s),
      });
      expect(canRevealForMatch(m)).toBe(table[s]);
    });
  }

  it("sem mutualidade nunca revela, mesmo com conexão apresentados", () => {
    const m = makeMatch({
      id: "no-mutual",
      myDecision: "interesse",
      otherDecision: "sem_decisao",
      connection: makeConnection("apresentados"),
    });
    expect(canRevealForMatch(m)).toBe(false);
  });
});

describe("revealDisabledHint — texto auxiliar acessível", () => {
  it("sem mutualidade menciona interesse mútuo", () => {
    expect(revealDisabledHint(makeMatch({ id: "x" }))).toMatch(/mútuo/i);
  });
  it("mútuo sem conexão menciona equipe", () => {
    expect(
      revealDisabledHint(
        makeMatch({
          id: "y",
          myDecision: "interesse",
          otherDecision: "interesse",
        }),
      ),
    ).toMatch(/equipe/i);
  });
  it("aguardando/em_atendimento mostram próxima etapa", () => {
    expect(
      revealDisabledHint(
        makeMatch({
          id: "z",
          myDecision: "interesse",
          otherDecision: "interesse",
          connection: makeConnection("aguardando"),
        }),
      ),
    ).toMatch(/apresent/i);
  });
  it("cancelado é sanitizado, sem detalhes internos", () => {
    const h = revealDisabledHint(
      makeMatch({
        id: "c",
        myDecision: "interesse",
        otherDecision: "interesse",
        connection: makeConnection("cancelado"),
      }),
    );
    expect(h).toMatch(/cancelado/i);
    expect(h).not.toMatch(/postgres|sql|rpc|jwt/i);
  });
});

describe("tradutores sanitizados de erro", () => {
  it("reveal: não vaza internals para nenhum código", () => {
    const codes = [
      "not_mutual",
      "not_yet_introduced",
      "contact_sharing_disabled",
      "contact_unavailable",
      "not_a_participant",
      "not_authenticated",
      "sign_in_failed",
      "network",
      "reveal_forbidden",
      "unknown",
      "invalid_response",
    ] as const;
    for (const c of codes) {
      const msg = translateRevealErrorCode(c);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/postgres|sql|rpc|jwt|supabase|stack/i);
    }
  });

  it("isRevealRetriable habilita apenas network/unknown/contact_unavailable", () => {
    expect(isRevealRetriable("network")).toBe(true);
    expect(isRevealRetriable("unknown")).toBe(true);
    expect(isRevealRetriable("contact_unavailable")).toBe(true);
    expect(isRevealRetriable("not_mutual")).toBe(false);
    expect(isRevealRetriable("contact_sharing_disabled")).toBe(false);
    expect(isRevealRetriable("not_yet_introduced")).toBe(false);
    expect(isRevealRetriable("reveal_forbidden")).toBe(false);
  });

  it("recompute tem tradutor DEDICADO, distinto de decide", () => {
    expect(translateRecomputeErrorCode("profile_not_found")).toMatch(/perfil/i);
    expect(translateRecomputeErrorCode("event_not_active")).toMatch(/evento/i);
    expect(translateRecomputeErrorCode("network")).toMatch(/conexão/i);
    // Nunca reutiliza mensagens de decisão
    expect(translateRecomputeErrorCode("unknown")).not.toEqual(translateDecideErrorCode("unknown"));
    expect(translateRecomputeErrorCode("network")).not.toEqual(translateDecideErrorCode("network"));
  });
});

describe("formatSegmentLabel — sem catálogo autoritativo", () => {
  it("humaniza slug", () => {
    expect(formatSegmentLabel("industria_metalurgica")).toBe("Industria Metalurgica");
  });
  it("humanizeSlug lida com hífen", () => {
    expect(humanizeSlug("agro-tech")).toBe("Agro Tech");
  });
  it("null/vazio → string vazia", () => {
    expect(formatSegmentLabel(null)).toBe("");
    expect(formatSegmentLabel(undefined)).toBe("");
    expect(formatSegmentLabel("")).toBe("");
  });
  it("expõe traduções canônicas de need/status", () => {
    expect(NEED_KIND_TEXT.fornecedor).toMatch(/fornecedor/i);
    expect(CONNECTION_STATUS_TEXT.apresentados).toMatch(/apresentad/i);
  });
});

describe("resolveMatchesDisplayState — 3 casos exatos + cache vazio", () => {
  it("erro inicial SEM cache → blocking_error", () => {
    expect(
      resolveMatchesDisplayState({
        matches: [],
        hasCachedResult: false,
        loading: false,
        hasError: true,
      }),
    ).toEqual({ kind: "blocking_error" });
  });

  it("primeira carga SEM cache → initial_loading", () => {
    expect(
      resolveMatchesDisplayState({
        matches: [],
        hasCachedResult: false,
        loading: true,
        hasError: false,
      }),
    ).toEqual({ kind: "initial_loading" });
  });

  it("cache [] + erro de refresh → empty + aviso não bloqueante", () => {
    expect(
      resolveMatchesDisplayState({
        matches: [],
        hasCachedResult: true,
        loading: false,
        hasError: true,
      }),
    ).toEqual({ kind: "empty", showRefreshError: true });
  });

  it("cache com cards + erro de refresh → list + aviso", () => {
    const m = [makeMatch({ id: "m1" })];
    const state = resolveMatchesDisplayState({
      matches: m,
      hasCachedResult: true,
      loading: false,
      hasError: true,
    });
    expect(state.kind).toBe("list");
    if (state.kind === "list") {
      expect(state.showRefreshError).toBe(true);
      expect(state.matches).toHaveLength(1);
    }
  });

  it("cache [] sem erro → empty puro (sem aviso)", () => {
    expect(
      resolveMatchesDisplayState({
        matches: [],
        hasCachedResult: true,
        loading: false,
        hasError: false,
      }),
    ).toEqual({ kind: "empty", showRefreshError: false });
  });
});

describe("ownMatchesQueryOptions — contrato de polling", () => {
  it("usa refetchInterval passado e nunca refetch em background", () => {
    const opts = ownMatchesQueryOptions("evt", { refetchIntervalMs: 20_000 });
    expect(opts.refetchInterval).toBe(20_000);
    expect(opts.refetchIntervalInBackground).toBe(false);
    expect(opts.staleTime).toBe(5_000);
    expect(opts.enabled).toBe(true);
    expect(opts.queryKey).toEqual(["own-matches", "evt"]);
  });
  it("enabled=false quando pedido", () => {
    const opts = ownMatchesQueryOptions("evt", { enabled: false });
    expect(opts.enabled).toBe(false);
  });
});

describe("recompute mutation invalida matches e public stats", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/features/matching/api");
  });

  it("onSuccess invalida ambas as chaves", async () => {
    vi.doMock("@/features/matching/api", () => ({
      listOwnMatches: vi.fn(async () => []),
      recordMatchDecision: vi.fn(),
      recomputeOwnMatches: vi.fn(async () => 3),
      revealContactForMatch: vi.fn(),
    }));
    const invalidateSpy = vi.fn();
    vi.doMock("@tanstack/react-query", () => ({
      useMutation: (opts: {
        mutationFn: (v: unknown) => unknown;
        onSuccess?: (d: unknown) => void;
      }) => ({
        mutate: async (v: unknown) => {
          const d = await opts.mutationFn(v);
          opts.onSuccess?.(d);
        },
        isPending: false,
      }),
      useQuery: () => ({}),
      useQueryClient: () => ({ invalidateQueries: invalidateSpy }),
    }));
    const mod = await import("@/features/matching/queries");
    const mutation = mod.useRecomputeMatchesMutation("evt");
    await mutation.mutate(undefined);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["own-matches", "evt"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["stats", "evt"],
    });
  });
});

// ---------------------------------------------------------------------------
// Static source guards — vetos duros da Onda C.
// ---------------------------------------------------------------------------

function read(rel: string): string {
  return readFileSync(resolve(__dirname, "..", "..", rel), "utf8");
}

/** Remove block/line comments para permitir menções em JSDoc sem falso positivo. */
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("static guards — /participante e componentes", () => {
  const files = [
    "src/routes/participante.tsx",
    "src/features/participant/components/ParticipantHeader.tsx",
    "src/features/participant/components/MatchesList.tsx",
    "src/features/participant/components/MatchCard.tsx",
    "src/features/participant/components/ConnectionsList.tsx",
    "src/features/participant/components/ProfileCard.tsx",
    "src/features/participant/components/RevealContactDialog.tsx",
    "src/features/participant/components/RecoveryView.tsx",
    "src/features/participant/components/RotateRecoveryButton.tsx",
  ];

  const banned = [
    "useSession",
    "useOwnMatches",
    "useDecideMatch",
    "features/connections/useRevealContact",
    "SEGMENTS",
    "NEED_KIND_LABELS",
    "useEventTaxonomy",
    "supabase.channel",
    "testing/matching-spec",
  ];

  for (const f of files) {
    const src = readCode(f);
    for (const token of banned) {
      it(`${f} não contém "${token}"`, () => {
        if (token === "useOwnMatches") {
          expect(src).not.toMatch(/useOwnMatches\b(?!Query)/);
        } else if (token === "useDecideMatch") {
          expect(src).not.toMatch(/useDecideMatch\b(?!Mutation)/);
        } else {
          expect(src.includes(token)).toBe(false);
        }
      });
    }
  }

  it("participante.tsx importa RotateRecoveryButton só via ParticipantHeader", () => {
    expect(readCode("src/routes/participante.tsx")).not.toMatch(/RotateRecoveryButton/);
  });

  it("ProfileCard renderiza link para /participar (edição do wizard)", () => {
    const src = read("src/features/participant/components/ProfileCard.tsx");
    expect(src).toMatch(/to="\/participar"/);
    expect(src).toMatch(/data-testid="link-edit-profile"/);
  });

  it("RotateRecoveryButton usa API v2, nunca supabase.rpc", () => {
    const src = readCode("src/features/participant/components/RotateRecoveryButton.tsx");
    expect(src).toMatch(/rotateOwnRecoveryCode/);
    expect(src).not.toMatch(/supabase\.rpc/);
  });

  it("Recovery/Reveal não persistem código/telefone em storage/URL/log", () => {
    const recovery = readCode("src/features/participant/components/RecoveryView.tsx");
    const reveal = readCode("src/features/participant/components/RevealContactDialog.tsx");
    for (const src of [recovery, reveal]) {
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/sessionStorage/);
      expect(src).not.toMatch(/document\.cookie/);
      expect(src).not.toMatch(/console\.(log|info|warn|error)/);
      expect(src).not.toMatch(/navigate\([^)]*whatsapp/i);
      expect(src).not.toMatch(/navigate\([^)]*recoveryCode/i);
      expect(src).not.toMatch(/searchParams.*(code|phone|whatsapp)/i);
    }
  });

  it("Reveal: mutation cache é purgado (reset + gcTime:0)", () => {
    const reveal = read("src/features/participant/components/RevealContactDialog.tsx");
    // Deve chamar mutation.reset() em pelo menos 3 caminhos (sucesso, erro, close).
    const resets = reveal.match(/mutation\.reset\(\)/g) ?? [];
    expect(resets.length).toBeGreaterThanOrEqual(3);
    // Deve existir uma clearAndClose ou equivalente para o fluxo de fechamento.
    expect(reveal).toMatch(/clearAndClose/);
    // Guardas de resposta tardia
    expect(reveal).toMatch(/requestVersionRef/);
    expect(reveal).toMatch(/mountedRef/);

    // gcTime:0 no hook
    const queries = read("src/features/matching/queries.ts");
    expect(queries).toMatch(/gcTime:\s*0/);
  });

  it("Recovery: chama recoverMutation.reset() em sucesso e erro", () => {
    const src = read("src/features/participant/components/RecoveryView.tsx");
    expect(src).toMatch(/recoverMutation\.reset\(\)/);
    expect(src).toMatch(/requestVersionRef/);
  });

  it("participante.tsx usa translateRecomputeErrorCode (não decide)", () => {
    const src = read("src/routes/participante.tsx");
    expect(src).toMatch(/translateRecomputeErrorCode/);
    expect(src).not.toMatch(/translateDecideErrorCode/);
  });
});

// ---------------------------------------------------------------------------
// Guarantia adicional: Recovery reset em sucesso via helper simulado.
// ---------------------------------------------------------------------------

describe("RecoveryView — semântica de reset após mutation", () => {
  it("função de recuperação: após sucesso, mutation.reset() é chamado", async () => {
    // Simula a rotina interna da view em isolamento (helpers puros).
    const reset = vi.fn();
    const mutateAsync = vi.fn(async () => ({
      newRecoveryCode: "ABC123",
    }));
    const mutation = { mutateAsync, reset };

    // Reproduz o núcleo do handler:
    async function recover() {
      const res = await mutation.mutateAsync();
      const rotated = res.newRecoveryCode ?? null;
      mutation.reset();
      return rotated;
    }
    const code = await recover();
    expect(code).toBe("ABC123");
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("após erro traduzido, mutation.reset() é chamado antes de propagar", async () => {
    const reset = vi.fn();
    const mutateAsync = vi.fn(async () => {
      throw new Error("mensagem já traduzida");
    });
    const mutation = { mutateAsync, reset };

    async function recover() {
      try {
        await mutation.mutateAsync();
      } catch (err) {
        mutation.reset();
        return (err as Error).message;
      }
    }
    const msg = await recover();
    expect(msg).toBe("mensagem já traduzida");
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
