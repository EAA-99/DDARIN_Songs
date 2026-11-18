import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./helpers/db";

test("migrations create all tables", async () => {
  const db = await createTestDb();
  const r: any = await db.execute(sql`select table_name from information_schema.tables where table_schema='public' order by 1`);
  expect(r.rows.map((x: any) => x.table_name)).toEqual(
    ["clips", "login_attempts", "performances", "songs", "sync_runs", "sync_state"]);
});
