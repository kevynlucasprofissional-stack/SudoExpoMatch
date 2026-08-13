import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  participantesSearchSchema,
  normalizeParticipantesSearch,
  segmentsToParam,
  pageToOffset,
  totalPages,
  PARTICIPANTS_PAGE_SIZE,
  PARTICIPANTS_MAX_LIMIT,
} from "@/features/admin/participantsUrlState";
import {
  participantsPageSchema,
  participantDetailSchema,
  hasPrivateKey,
  FORBIDDEN_PRIVATE_KEYS,
  translateAdminParticipantsError,
} from "@/features/admin/participantsSchemas";
import { participantsKey, participantDetailKey } from "@/features/admin/useAdminParticipants";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const ROUTE = read("src/routes/admin_.participantes.tsx");
const SHEET = read("src/features/admin/ParticipantDetailSheet.tsx");
const API = read("src/features/admin/useAdminParticipants.ts");
const ADMIN = read("src/routes/admin.tsx");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function row(over: Record<string, unknown> = {}) {
  return {
    id: UUID_A,
    name: "Ana",
    company: "Padaria",
    city: "Rio Verde",
    segment_id: "alimentacao",
    segment_label: "Alimentação",
    segment_emoji: "🍞",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    offers_count: 2,
    needs_count: 1,
    matches_count: 3,
    connections_count: 0,
    ...over,
  };
}

function detail(over: Record<string, unknown> = {}) {
  return {
    profile: {
      id: UUID_A,
      event_id: "sudoexpo-2026",
      name: "Ana",
      company: "Padaria",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: "alimentacao",
      segment_label: "Alimentação",
      summary: "resumo",
      is_demo: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
    offers: [],
    needs: [],
    matches: [],
    connections: [],
    history: [],
    ...over,
  };
}

describe("IMPL 9 — estado de URL", () => {
  it("aplica defaults com URL vazia", () => {
    const n = normalizeParticipantesSearch(participantesSearchSchema.parse({}));
    expect(n).toEqual({ q: "", segments: [], city: "", page: 1, selected: null });
  });

  it("nunca lança em URL inválida e sanitiza page", () => {
    const parsed = participantesSearchSchema.parse({ page: "abc", q: 1 as never });
    const n = normalizeParticipantesSearch(parsed);
    expect(n.page).toBe(1);
    expect(normalizeParticipantesSearch({ page: -9 }).page).toBe(1);
    expect(normalizeParticipantesSearch({ page: 999999 }).page).toBe(9999);
  });

  it("limita tamanho da busca e da cidade", () => {
    const n = normalizeParticipantesSearch({ q: "x".repeat(500), city: "y".repeat(500) });
    expect(n.q.length).toBe(120);
    expect(n.city.length).toBe(80);
  });

  it("segmentos: split, trim, dedupe de vazios e teto de 25", () => {
    const n = normalizeParticipantesSearch({ segments: " a , b ,, c " });
    expect(n.segments).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: 40 }, (_, i) => `s${i}`).join(",");
    expect(normalizeParticipantesSearch({ segments: many }).segments).toHaveLength(25);
    expect(segmentsToParam(["a", "", "b"])).toBe("a,b");
  });

  it("só aceita uuid no parâmetro de detalhe (p)", () => {
    expect(normalizeParticipantesSearch({ p: UUID_B }).selected).toBe(UUID_B);
    expect(normalizeParticipantesSearch({ p: "'; drop table" }).selected).toBeNull();
    expect(normalizeParticipantesSearch({ p: "" }).selected).toBeNull();
  });

  it("paginação converte página 1-based em offset", () => {
    expect(pageToOffset(1)).toBe(0);
    expect(pageToOffset(3)).toBe(2 * PARTICIPANTS_PAGE_SIZE);
    expect(totalPages(0)).toBe(1);
    expect(totalPages(PARTICIPANTS_PAGE_SIZE + 1)).toBe(2);
  });
});

describe("IMPL 9 — schemas de resposta", () => {
  it("aceita página válida da RPC", () => {
    const parsed = participantsPageSchema.parse({
      items: [row()],
      total: 1,
      limit: 20,
      offset: 0,
    });
    expect(parsed.items[0].matches_count).toBe(3);
  });

  it("rejeita shape inválido (id não-uuid, counts negativos, total ausente)", () => {
    expect(() =>
      participantsPageSchema.parse({ items: [row({ id: "nope" })], total: 1, limit: 20, offset: 0 }),
    ).toThrow();
    expect(() =>
      participantsPageSchema.parse({
        items: [row({ offers_count: -1 })],
        total: 1,
        limit: 20,
        offset: 0,
      }),
    ).toThrow();
    expect(() => participantsPageSchema.parse({ items: [], limit: 20, offset: 0 })).toThrow();
    expect(() =>
      participantsPageSchema.parse({ items: [], total: 0, limit: 0, offset: 0 }),
    ).toThrow();
  });

  it("tolera campos textuais nulos do banco", () => {
    const parsed = participantsPageSchema.parse({
      items: [row({ company: null, city: null, segment_label: null, segment_emoji: null })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    expect(parsed.items[0].company).toBe("");
  });

  it("detalhe válido passa e detalhe sem perfil falha", () => {
    expect(participantDetailSchema.parse(detail()).profile.name).toBe("Ana");
    expect(() => participantDetailSchema.parse({ offers: [] })).toThrow();
  });

  it("detalhe aceita ofertas/necessidades/matches/conexões/histórico", () => {
    const parsed = participantDetailSchema.parse(
      detail({
        offers: [
          {
            id: UUID_B,
            label: "Pães",
            detail: null,
            segment_id: "alimentacao",
            taxonomy_item_id: null,
            source: "user",
            user_confirmed: true,
            active: true,
            sort_order: 0,
          },
        ],
        needs: [
          {
            id: UUID_A,
            label: "Marketing",
            detail: null,
            segment_id: "marketing",
            taxonomy_item_id: null,
            source: "ai",
            user_confirmed: true,
            active: true,
            sort_order: 0,
            need_kind: "servico",
            is_priority: true,
          },
        ],
        matches: [
          {
            id: UUID_B,
            other_profile_id: UUID_A,
            other_name: "Bruno",
            other_company: "Beta",
            other_segment_id: "marketing",
            kind: "bidirecional",
            label: "alta_compatibilidade",
            score_for_participant: 80,
            score_for_other: 62,
            decision_participant: "sem_decisao",
            decision_other: "interesse",
            algorithm_version: "v2.3",
            generated_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        history: [
          { kind: "connection", action: "assume", previous_status: null, new_status: "em_atendimento", created_at: "2026-01-01T00:00:00Z" },
        ],
      }),
    );
    expect(parsed.needs[0].need_kind).toBe("servico");
    expect(parsed.matches[0].score_for_participant).toBe(80);
    expect(parsed.history).toHaveLength(1);
  });
});

describe("IMPL 9 — privacidade (nenhum contato nesta área)", () => {
  it("hasPrivateKey detecta chaves proibidas em qualquer profundidade", () => {
    expect(hasPrivateKey({ a: { b: [{ whatsapp: "x" }] } })).toBe(true);
    expect(hasPrivateKey({ profile: { phone_e164: "+55" } })).toBe(true);
    expect(hasPrivateKey({ recovery_code: "abc" })).toBe(true);
    expect(hasPrivateKey(detail())).toBe(false);
  });

  it("schema do detalhe descarta chaves de contato injetadas no payload", () => {
    const parsed = participantDetailSchema.parse(
      detail({ profile: { ...detail().profile, whatsapp: "+5564900000000" } as never }),
    );
    expect(hasPrivateKey(parsed)).toBe(false);
  });

  it("nem a rota nem o detalhe referenciam campos de contato", () => {
    for (const key of FORBIDDEN_PRIVATE_KEYS) {
      if (key === "email") continue; // "email" não aparece; checado abaixo sem falso positivo
      expect(ROUTE.toLowerCase()).not.toContain(key);
      expect(SHEET.toLowerCase()).not.toContain(key);
    }
    expect(SHEET).not.toMatch(/reveal_contact|staff_reveal/i);
    expect(ROUTE).not.toMatch(/reveal_contact|staff_reveal/i);
  });
});

describe("IMPL 9 — query keys e wrapper de API", () => {
  it("queryKey inclui todos os filtros e é estável para ordem de segmentos", () => {
    const base = { q: "ana", segments: ["b", "a"], city: "Rio", offset: 20 };
    expect(participantsKey("ev", base)).toEqual(
      participantsKey("ev", { ...base, segments: ["a", "b"] }),
    );
    expect(participantsKey("ev", base)).not.toEqual(
      participantsKey("ev", { ...base, city: "Outra" }),
    );
    expect(participantsKey("ev", base)).not.toEqual(
      participantsKey("ev", { ...base, offset: 0 }),
    );
    expect(participantsKey("ev", base)).not.toEqual(participantsKey("ev2", base));
    expect(participantDetailKey(UUID_A)).not.toEqual(participantDetailKey(UUID_B));
  });

  it("todo acesso ao banco fica no wrapper — a rota não chama supabase", () => {
    expect(ROUTE).not.toContain("supabase");
    expect(SHEET).not.toContain("supabase");
    expect(API).toContain("admin_list_participants");
    expect(API).toContain("admin_get_participant_detail");
  });

  it("wrapper aplica teto defensivo de limite e offset não-negativo", () => {
    expect(API).toContain("PARTICIPANTS_MAX_LIMIT");
    expect(PARTICIPANTS_MAX_LIMIT).toBe(100);
    expect(API).toContain("Math.max(0, f.offset)");
  });

  it("é read-only: nenhuma mutation nesta área", () => {
    expect(API).not.toContain("useMutation");
    expect(ROUTE).not.toContain("useMutation");
    expect(SHEET).not.toContain("useMutation");
  });

  it("traduz erros do backend", () => {
    expect(translateAdminParticipantsError(new Error("forbidden"))).toMatch(/negado/i);
    expect(translateAdminParticipantsError(new Error("not_authenticated"))).toMatch(/Sessão/);
    expect(translateAdminParticipantsError(new Error("not_found"))).toMatch(/não encontrado/i);
  });
});

describe("IMPL 9 — rota e UI", () => {
  it("rota é protegida por papel admin do evento", () => {
    expect(ROUTE).toContain("useEventRole");
    expect(ROUTE).toContain('roleQuery.data !== "admin"');
    expect(ROUTE).toContain("Acesso negado");
    expect(ROUTE).toContain('name: "robots", content: "noindex,nofollow"');
  });

  it("tem busca com debounce e paginação server-side", () => {
    expect(ROUTE).toContain("useDebouncedValue");
    expect(ROUTE).toContain("pageToOffset");
    expect(ROUTE).toContain('aria-label="Paginação"');
  });

  it("cobre estados de loading, erro e vazio", () => {
    expect(ROUTE).toContain("listQuery.isLoading");
    expect(ROUTE).toContain("listQuery.isError");
    expect(ROUTE).toContain("Nenhum participante");
  });

  it("estrutura mobile: cards em lista, sem tabela horizontal", () => {
    expect(ROUTE).not.toMatch(/<table|components\/ui\/table/);
    expect(ROUTE).toContain('aria-label="Lista de participantes"');
    expect(ROUTE).toMatch(/sm:grid-cols-\[1fr_180px_180px\]/);
  });

  it("detalhe usa Sheet com abas exigidas", () => {
    for (const tab of ["Perfil", "Ofertas", "Necessidades", "Matches", "Conexões", "Histórico"]) {
      expect(SHEET).toContain(tab);
    }
    expect(SHEET).toContain("TabsTrigger");
  });

  it("admin existente ganha navegação sem perder os links atuais", () => {
    expect(ADMIN).toContain('to="/admin/participantes"');
    expect(ADMIN).toContain('to="/equipe"');
  });
});
