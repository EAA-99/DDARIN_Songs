import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

/**
 * 운영 DB(Neon). 트랜잭션이 필요해서 HTTP 대신 WebSocket Pool 드라이버를 쓴다.
 * 로컬 개발: DATABASE_URL=pglite:<폴더> 이면 파일 기반 PGlite를 쓴다(스키마는 scripts/dev-seed.ts가 적용).
 */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL이 설정되지 않았습니다");
    db = url.startsWith("pglite:") ? localDb(url.slice("pglite:".length)) : (drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db);
  }
  return db;
}

function localDb(dir: string): Db {
  // 개발 때만 불러온다(운영 경로에서는 실행되지 않음)
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const { drizzle: pglite } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return pglite(new PGlite(dir), { schema }) as unknown as Db;
}
