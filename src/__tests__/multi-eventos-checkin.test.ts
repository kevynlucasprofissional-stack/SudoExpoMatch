import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mapPhoneLoginError,
  translatePhoneLoginError,
} from "@/features/access/phoneLogin";
import { normalizePhoneToE164 } from "@/lib/phone-auth";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Multi-eventos: separação e check-in", () => {
  it("normaliza telefones com formatos variados para lookup e check-in", () => {
    const res = normalizePhoneToE164("64 981630978");
    expect(res.ok && res.e164).toBe("+5564981630978");
  });

  it("mapeia erro de check-in não encontrado para mensagem amigável", () => {
    expect(mapPhoneLoginError("checkin_source_profile_not_found")).toBe("not_found");
    expect(mapPhoneLoginError("target_event_not_found")).toBe("not_found");
    expect(translatePhoneLoginError("not_found")).toMatch(/não encontramos/i);
  });

  it("PhoneLoginCard suporta a fase de check-in de edições anteriores", () => {
    const src = read("src/features/access/PhoneLoginCard.tsx");
    // Fases phone, confirm e checkin presentes
    expect(src).toMatch(/Phase = "phone" \| "confirm" \| "checkin"/);
    expect(src).toMatch(/hasPreviousEvent/);
    expect(src).toMatch(/Confirmar Check-in na SudoExpo 2026/);
    expect(src).toMatch(/checkinParticipantByPhone/);
    // Privacidade e sem vazamentos
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it("PhoneLogin API expõe checkinParticipantByPhone e campos de evento anterior", () => {
    const src = read("src/features/access/phoneLogin.ts");
    expect(src).toMatch(/hasPreviousEvent\?: boolean/);
    expect(src).toMatch(/previousEventId\?: string/);
    expect(src).toMatch(/previousEventName\?: string/);
    expect(src).toMatch(/export async function checkinParticipantByPhone/);
  });

  it("Admin possui infraestrutura de eventos e seleção por contexto", () => {
    const adminEventsSrc = read("src/features/admin/useAdminEvents.ts");
    expect(adminEventsSrc).toMatch(/useAdminEvents/);
    expect(adminEventsSrc).toMatch(/useStaffCheckinMutation/);
    expect(adminEventsSrc).toMatch(/staff_checkin_participant/);

    const selectorSrc = read("src/features/admin/EventSelector.tsx");
    expect(selectorSrc).toMatch(/EventSelector/);
    expect(selectorSrc).toMatch(/useAdminEvent/);
  });

  it("Migration SQL define a segregação do Café Entre Amigos e as RPCs de check-in", () => {
    const migrationSql = read("supabase/migrations/20260909155500_multi_eventos_separacao_e_checkin.sql");
    expect(migrationSql).toMatch(/cafe-entre-amigos-ago-2026/);
    expect(migrationSql).toMatch(/sudoexpo-2026/);
    expect(migrationSql).toMatch(/participant_checkin_by_phone/);
    expect(migrationSql).toMatch(/staff_checkin_participant/);
    expect(migrationSql).toMatch(/admin_list_events/);
  });
});
