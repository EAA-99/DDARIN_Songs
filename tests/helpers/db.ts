import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

/** 메모리 Postgres(PGlite)에 실제 마이그레이션을 적용한 테스트 DB. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../src/db/migrations") });
  return db as unknown as Db;
}
