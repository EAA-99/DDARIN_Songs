// 첫 전체 수집을 끝까지 반복: DATABASE_URL=... npx tsx scripts/backfill.ts
import { getDb } from "../src/db";
import { fetchClipDetail, fetchClipPage } from "../src/lib/soop";
import { runBackfillStep } from "../src/server/sync";

async function main() {
  const db = getDb();
  for (;;) {
    const r = await runBackfillStep(db, { fetchPage: fetchClipPage, fetchDetail: fetchClipDetail, now: () => new Date() });
    console.log(`${(r.progress * 100).toFixed(1)}%  새 클립 ${r.newClips}  상태 ${r.status}${r.error ? `  오류 ${r.error}` : ""}`);
    if (r.done) break;
    if (r.status === "error") process.exit(1);
    if (r.status === "busy") await new Promise((res) => setTimeout(res, 10_000));
  }
  console.log("첫 수집 완료");
  process.exit(0);
}
main();
