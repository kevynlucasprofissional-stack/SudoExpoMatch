import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const hasDb = !!process.env.PGHOST;
const d = hasDb ? describe : describe.skip;

function q(sql: string): string {
  return execFileSync("psql", ["-tAX", "-c", sql], {
    encoding: "utf8",
    env: process.env,
  }).trim();
}

d("Fase Seg-1 — analytics_events + taxonomy_items policies", () => {
  it("analytics_events: policy INSERT restritiva presente, sem UPDATE/DELETE", () => {
    const rows = q(
      "SELECT polname||':'||polcmd FROM pg_policy WHERE polrelid='public.analytics_events'::regclass ORDER BY 1",
    )
      .split("\n")
      .filter(Boolean);
    expect(rows).toEqual(["analytics_events_insert_self:a"]);
  });

  it("analytics_events: WITH CHECK usa auth.uid() e allowlist de kind", () => {
    const check = q(
      "SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polname='analytics_events_insert_self'",
    );
    expect(check).toContain("auth.uid()");
    expect(check).toContain("actor_user_id = auth.uid()");
    expect(check).toContain("onboarding_started");
    expect(check).toContain("jsonb_typeof(payload)");
    // Sem WITH CHECK (true) irrestrito
    expect(check).not.toMatch(/WITH CHECK \(true\)/i);
  });

  it("analytics_events: trigger de actor_user_id ativo", () => {
    const t = q(
      "SELECT tgname FROM pg_trigger WHERE tgrelid='public.analytics_events'::regclass AND NOT tgisinternal",
    );
    expect(t).toContain("trg_analytics_events_set_actor");
  });

  it("analytics_events: anon não tem INSERT/UPDATE/DELETE", () => {
    const anonIns = q(
      "SELECT has_table_privilege('anon','public.analytics_events','INSERT')",
    );
    const anonUpd = q(
      "SELECT has_table_privilege('anon','public.analytics_events','UPDATE')",
    );
    const anonDel = q(
      "SELECT has_table_privilege('anon','public.analytics_events','DELETE')",
    );
    expect(anonIns).toBe("f");
    expect(anonUpd).toBe("f");
    expect(anonDel).toBe("f");
  });

  it("analytics_events: authenticated não tem UPDATE/DELETE", () => {
    const upd = q(
      "SELECT has_table_privilege('authenticated','public.analytics_events','UPDATE')",
    );
    const del = q(
      "SELECT has_table_privilege('authenticated','public.analytics_events','DELETE')",
    );
    expect(upd).toBe("f");
    expect(del).toBe("f");
  });

  it("taxonomy_items: policies separadas por comando; sem policy ALL", () => {
    const rows = q(
      "SELECT polname||':'||polcmd FROM pg_policy WHERE polrelid='public.taxonomy_items'::regclass ORDER BY 1",
    )
      .split("\n")
      .filter(Boolean);
    expect(rows).toEqual([
      "taxonomy_items_delete_staff:d",
      "taxonomy_items_insert_staff:a",
      "taxonomy_items_read_active:r",
      "taxonomy_items_read_staff_all:r",
      "taxonomy_items_update_staff:w",
    ]);
  });

  it("taxonomy_items: leitura de participante filtrada por active=true", () => {
    const using = q(
      "SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname='taxonomy_items_read_active'",
    );
    expect(using).toContain("active");
  });

  it("taxonomy_items: escritas exigem is_staff e não-anônimo", () => {
    for (const p of [
      "taxonomy_items_insert_staff",
      "taxonomy_items_update_staff",
      "taxonomy_items_delete_staff",
    ]) {
      const check = q(
        `SELECT COALESCE(pg_get_expr(polwithcheck, polrelid), pg_get_expr(polqual, polrelid)) FROM pg_policy WHERE polname='${p}'`,
      );
      expect(check).toContain("is_staff");
      expect(check).toContain("is_anonymous");
    }
  });

  it("taxonomy_items: anon não tem SELECT nem escrita", () => {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const r = q(
        `SELECT has_table_privilege('anon','public.taxonomy_items','${priv}')`,
      );
      expect(r, `anon ${priv}`).toBe("f");
    }
  });

  it("taxonomy_items: authenticated pode SELECT (RLS filtra por active)", () => {
    const r = q(
      "SELECT has_table_privilege('authenticated','public.taxonomy_items','SELECT')",
    );
    expect(r).toBe("t");
  });
});
