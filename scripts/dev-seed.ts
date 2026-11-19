// 로컬 개발용 데이터: 스키마 적용 후 매일 갱신을 한 번 돌려 최근 90일 클립을 넣는다.
//   DATABASE_URL=pglite:.data/dev npx tsx scripts/dev-seed.ts [실행 횟수]
import { migrate } from "drizzle-orm/pglite/migrator";
import { getDb } from "../src/db";
import { fetchClipDetail, fetchClipPage } from "../src/lib/soop";
import { runDaily } from "../src/server/sync";

async function main() {
  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: "src/db/migrations" });
  // 최근 90일을 끝까지 받을 때까지 여러 번 돌린다(이어받기)
  for (let i = 0; i < Number(process.argv[2] ?? 1); i++) {
    const r = await runDaily(db, { fetchPage: fetchClipPage, fetchDetail: fetchClipDetail, now: () => new Date(), budget: 400 }, "manual");
    console.log(r);
  }
  process.exit(0);
}
main();
