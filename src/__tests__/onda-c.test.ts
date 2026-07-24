import { describe, it, expect } from "vitest";
import { resolveParticipantPageState } from "@/features/participant/pageState";
import {
  filterInterests,
  filterActiveConnections,
  filterPendingConnections,
  filterCancelledConnections,
  canRevealForMatch,
  translateRevealErrorCode,
  formatSegmentLabel,
  isMatchMutual,
} from "@/features/participant/presentation";
import type { OwnMatchDTO } from "@/features/participant/types";

function match(over: Partial<OwnMatchDTO> = {}): OwnMatchDTO {
  return {
    match_id: "m1",
    kind: "oferta_encaixa_necessidade",
    score: 90,
    label: "alta_compatibilidade",
    my_decision: null,
    other_decision: null,
    reasons: [],
    other: {
      profile_id: "p2",
      name: "Ana Silva",
      company: "Acme",
      city: "Rio Verde",
      segment_id: "servicos",
      summary: "s",
    },
    other_offers: [],
    other_needs: [],
    connection: null,
    ...over,
  } as OwnMatchDTO;
}

describe("pageState precedence", () => {
  const okProfile = { isPending: false, isError: false, data: { id: "p" } as any };

  it("session_error wins over everything", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "error" },
        profile: { isPending: true, isError: true, data: null },
      }).kind,
    ).toBe("session_error");
  });
  it("session_loading before profile", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "loading" },
        profile: okProfile,
      }).kind,
    ).toBe("session_loading");
  });
  it("profile_error never becomes recovery", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: { isPending: false, isError: true, data: null },
      }).kind,
    ).toBe("profile_error");
  });
  it("profile loading skeleton", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: { isPending: true, isError: false, data: undefined },
      }).kind,
    ).toBe("profile_loading");
  });
  it("recovery when null", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: { isPending: false, isError: false, data: null },
      }).kind,
    ).toBe("recovery");
  });
  it("panel when data present", () => {
    expect(
      resolveParticipantPageState({
        session: { status: "ready" },
        profile: okProfile,
      }).kind,
    ).toBe("panel");
  });
});

describe("filters based on real decisions", () => {
  const interested = match({ my_decision: "interesse" });
  const declined = match({ match_id: "m2", my_decision: "agora_nao" });
  const mutualNoConn = match({
    match_id: "m3",
    my_decision: "interesse",
    other_decision: "interesse",
  });
  const mutualActive = match({
    match_id: "m4",
    my_decision: "interesse",
    other_decision: "interesse",
    connection: { id: "c", status: "apresentados", notes: null } as any,
  });
  const mutualCancelled = match({
    match_id: "m5",
    my_decision: "interesse",
    other_decision: "interesse",
    connection: { id: "c2", status: "cancelado", notes: "x" } as any,
  });

  const all = [interested, declined, mutualNoConn, mutualActive, mutualCancelled];

  it("filterInterests only my_decision=interesse", () => {
    expect(filterInterests(all).map((m) => m.match_id)).toEqual([
      "m1",
      "m3",
      "m4",
      "m5",
    ]);
  });
  it("active excludes cancelled/pending", () => {
    expect(filterActiveConnections(all).map((m) => m.match_id)).toEqual(["m4"]);
  });
  it("pending is mutual w/o connection", () => {
    expect(filterPendingConnections(all).map((m) => m.match_id)).toEqual(["m3"]);
  });
  it("cancelled captured", () => {
    expect(filterCancelledConnections(all).map((m) => m.match_id)).toEqual([
      "m5",
    ]);
  });
  it("canReveal only after apresentados", () => {
    expect(canRevealForMatch(mutualActive)).toBe(true);
    expect(canRevealForMatch(mutualNoConn)).toBe(false);
    expect(canRevealForMatch(mutualCancelled)).toBe(false);
    expect(canRevealForMatch(interested)).toBe(false);
  });
  it("isMatchMutual", () => {
    expect(isMatchMutual(mutualActive)).toBe(true);
    expect(isMatchMutual(interested)).toBe(false);
  });
});

describe("reveal error translations sanitized", () => {
  it("not_mutual", () => {
    expect(translateRevealErrorCode("not_mutual")).toMatch(/interesse mútuo/i);
  });
  it("not_yet_introduced", () => {
    expect(translateRevealErrorCode("not_yet_introduced")).toMatch(/apresent/i);
  });
  it("contact_sharing_disabled", () => {
    expect(translateRevealErrorCode("contact_sharing_disabled")).toMatch(
      /desativou/i,
    );
  });
  it("contact_unavailable", () => {
    expect(translateRevealErrorCode("contact_unavailable")).toMatch(
      /não disponibilizad/i,
    );
  });
  it("unknown fallback never leaks internals", () => {
    const msg = translateRevealErrorCode("unknown");
    expect(msg).not.toMatch(/postgres|rpc|sql|jwt/i);
  });
});

describe("formatSegmentLabel", () => {
  it("uses catalog label when present", () => {
    expect(
      formatSegmentLabel("s1", [{ id: "s1", label: "Serviços" } as any]),
    ).toBe("Serviços");
  });
  it("humanizes slug when catalog missing", () => {
    expect(formatSegmentLabel("industria_metalurgica", [])).toBe(
      "Industria Metalurgica",
    );
  });
  it("empty when null", () => {
    expect(formatSegmentLabel(null)).toBe("");
  });
});
