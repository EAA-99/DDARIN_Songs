import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

/** 운영 DB(Neon). 트랜잭션이 필요해서 HTTP 대신 WebSocket Pool 드라이버를 쓴다. */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL이 설정되지 않았습니다");
    db = drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db;
  }
  return db;
}
