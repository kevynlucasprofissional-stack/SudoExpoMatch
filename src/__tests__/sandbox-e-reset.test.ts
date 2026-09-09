import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Sandbox e Reset / Exclusão de Participante", () => {
  it("Migration SQL define evento sandbox-sudoexpo e RPCs de exclusão/limpeza", () => {
    const migrationSql = read("supabase/migrations/20260909171500_sandbox_e_delecao_participante.sql");
    expect(migrationSql).toMatch(/sandbox-sudoexpo/);
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_delete_participant/);
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_clear_sandbox/);
    expect(migrationSql).toMatch(/DELETE FROM private\.phone_claim_attempts/);
  });

  it("useAdminParticipants expõe hooks de exclusão e reset de sandbox", () => {
    const src = read("src/features/admin/useAdminParticipants.ts");
    expect(src).toMatch(/export function useAdminDeleteParticipantMutation/);
    expect(src).toMatch(/admin_delete_participant/);
    expect(src).toMatch(/export function useAdminClearSandboxMutation/);
    expect(src).toMatch(/admin_clear_sandbox/);
  });

  it("Rota /participar aceita search param ?event= e isola no sandbox", () => {
    const src = read("src/routes/participar.tsx");
    expect(src).toMatch(/validateSearch/);
    expect(src).toMatch(/participarSearchSchema/);
    expect(src).toMatch(/targetEventId = search\.event \? search\.event : EVENT_ID/);
    expect(src).toMatch(/isSandbox = targetEventId === "sandbox-sudoexpo"/);
    expect(src).toMatch(/Ambiente de Testes \(Sandbox\)/);
  });

  it("Rota /participante aceita search param ?event= e exibe aviso de sandbox", () => {
    const src = read("src/routes/participante.tsx");
    expect(src).toMatch(/validateSearch/);
    expect(src).toMatch(/participanteSearchSchema/);
    expect(src).toMatch(/activeEventId = search\.event \? search\.event : EVENT_ID/);
    expect(src).toMatch(/isSandbox = activeEventId === "sandbox-sudoexpo"/);
    expect(src).toMatch(/Painel do Participante em Modo Sandbox/);
  });

  it("Painel do Admin possui botão Testar Cadastro (Sandbox) e ação de Zerar Sandbox", () => {
    const adminSrc = read("src/routes/admin.tsx");
    expect(adminSrc).toMatch(/\/participar\?event=sandbox-sudoexpo/);
    expect(adminSrc).toMatch(/btn-admin-test-sandbox/);
    expect(adminSrc).toMatch(/Zerar Dados do Sandbox/);
  });

  it("Tabela e detalhe de participantes possuem botão de Excluir participante com confirmação", () => {
    const tableSrc = read("src/routes/admin_.participantes.tsx");
    expect(tableSrc).toMatch(/btn-delete-participant/);
    expect(tableSrc).toMatch(/Excluir participante \/ Resetar cadastro\?/);
    expect(tableSrc).toMatch(/\/participar\?event=sandbox-sudoexpo/);

    const sheetSrc = read("src/features/admin/ParticipantDetailSheet.tsx");
    expect(sheetSrc).toMatch(/btn-sheet-delete-participant/);
    expect(sheetSrc).toMatch(/Excluir participante \/ Resetar cadastro\?/);
  });
});
