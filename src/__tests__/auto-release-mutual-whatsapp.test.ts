import { describe, it, expect } from "vitest";
import {
  canRevealForMatch,
  isMatchMutual,
  isContactReleasedByStaff,
  revealDisabledHint,
  filterActiveConnections,
  filterCancelledConnections,
} from "@/features/participant/presentation";
import type { OwnMatchDTO } from "@/features/participant/types";

function makeMatch(overrides: Partial<OwnMatchDTO> = {}): OwnMatchDTO {
  return {
    match_id: "m-1",
    my_profile_id: "me-1",
    other_profile_id: "p-2",
    score_me: 80,
    score_other: 75,
    kind: "direto",
    label: "alta_compatibilidade",
    label_me: "alta_compatibilidade",
    label_other: "alta_compatibilidade",
    my_decision: "sem_decisao",
    other_decision: "sem_decisao",
    connection: null,
    other: {
      name: "Roberta Alves",
      company: "AgroForte Insumos",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: "agronegocio",
      summary: "Fornecimento de insumos agrícolas",
    },
    reasons: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    generated_at: new Date().toISOString(),
    other_offers: [],
    other_needs: [],
    ...overrides,
  };
}

describe("Liberação Automática de WhatsApp em Interesse Mútuo", () => {
  it("detecta mutualidade corretamente quando ambos marcam 'interesse'", () => {
    const mutualMatch = makeMatch({
      my_decision: "interesse",
      other_decision: "interesse",
    });
    expect(isMatchMutual(mutualMatch)).toBe(true);

    const unilateralMy = makeMatch({
      my_decision: "interesse",
      other_decision: "sem_decisao",
    });
    expect(isMatchMutual(unilateralMy)).toBe(false);

    const unilateralOther = makeMatch({
      my_decision: "sem_decisao",
      other_decision: "interesse",
    });
    expect(isMatchMutual(unilateralOther)).toBe(false);
  });

  it("libera revelação de contato imediatamente quando o interesse for mútuo", () => {
    const match = makeMatch({
      my_decision: "interesse",
      other_decision: "interesse",
      connection: {
        id: "c-1",
        status: "apresentados",
        notes: null,
        contact_released_at: new Date().toISOString(),
      },
    });

    expect(canRevealForMatch(match)).toBe(true);
    expect(revealDisabledHint(match)).toBe("");
  });

  it("permite revelação para match mútuo mesmo se a conexão ainda estiver em transição", () => {
    const matchWithoutConnectionObject = makeMatch({
      my_decision: "interesse",
      other_decision: "interesse",
      connection: null,
    });

    expect(canRevealForMatch(matchWithoutConnectionObject)).toBe(true);
  });

  it("NÃO libera revelação se apenas uma das partes tiver interesse (unilateral)", () => {
    const unilateralMatch = makeMatch({
      my_decision: "interesse",
      other_decision: "sem_decisao",
      connection: null,
    });

    expect(canRevealForMatch(unilateralMatch)).toBe(false);
    expect(revealDisabledHint(unilateralMatch)).toMatch(/mútuo/i);
  });

  it("bloqueia revelação se a conexão tiver sido cancelada, mesmo com interesse mútuo", () => {
    const cancelledMatch = makeMatch({
      my_decision: "interesse",
      other_decision: "interesse",
      connection: {
        id: "c-cancel",
        status: "cancelado",
        notes: "Participante solicitou cancelamento",
        contact_released_at: null,
      },
    });

    expect(canRevealForMatch(cancelledMatch)).toBe(false);
    expect(revealDisabledHint(cancelledMatch)).toMatch(/cancelad/i);
  });

  it("permite revelação quando liberado por staff mesmo sem interesse mútuo", () => {
    const staffReleasedMatch = makeMatch({
      my_decision: "interesse",
      other_decision: "sem_decisao",
      connection: {
        id: "c-staff",
        status: "apresentados",
        notes: "Liberado pela coordenação no estande",
        contact_released_at: new Date().toISOString(),
      },
    });

    expect(isContactReleasedByStaff(staffReleasedMatch)).toBe(true);
    expect(canRevealForMatch(staffReleasedMatch)).toBe(true);
  });

  it("filtra corretamente conexões ativas para matches mútuos com conexão", () => {
    const activeMutual = makeMatch({
      match_id: "m-active",
      my_decision: "interesse",
      other_decision: "interesse",
      connection: {
        id: "c-active",
        status: "apresentados",
        notes: null,
        contact_released_at: new Date().toISOString(),
      },
    });

    const cancelledMutual = makeMatch({
      match_id: "m-cancelled",
      my_decision: "interesse",
      other_decision: "interesse",
      connection: {
        id: "c-cancelled",
        status: "cancelado",
        notes: "Cancelado",
        contact_released_at: null,
      },
    });

    const activeList = filterActiveConnections([activeMutual, cancelledMutual]);
    expect(activeList.map((m) => m.match_id)).toEqual(["m-active"]);

    const cancelledList = filterCancelledConnections([activeMutual, cancelledMutual]);
    expect(cancelledList.map((m) => m.match_id)).toEqual(["m-cancelled"]);
  });
});
