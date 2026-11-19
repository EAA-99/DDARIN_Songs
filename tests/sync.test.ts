import { beforeEach, expect, test } from "vitest";
import { count, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, syncRuns, syncState } from "@/db/schema";
import { kstDate, parseKst } from "@/lib/kst";
import { SoopFormatError, type PageQuery, type SoopClip } from "@/lib/soop";
import { oldWindows, recentRange, runBackfillStep, runDaily, type SyncDeps } from "@/server/sync";
import { GET } from "@/app/api/cron/route";
import { createTestDb } from "./helpers/db";

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

const NOW = parseKst("2026-11-19 04:00:00");
const mk = (titleNo: number, at: Date): SoopClip => ({
  titleNo, title: `따린 - Song ${titleNo % 7}`, uploaderNick: "v", uploaderId: "v1", regDate: at,
  readCnt: titleNo % 100, thumbUrl: "https://x/t.jpg", durationMs: 60000,
});
/** n개 클립을 now부터 step 시간 간격으로 과거로 */
const dataset = (n: number, stepHours: number, start = NOW, firstNo = 1) =>
  Array.from({ length: n }, (_, i) => mk(firstNo + i, new Date(start.getTime() - (i + 1) * stepHours * 3600_000)));

/** 가짜 SOOP: 기간·쪽 단위로 dataset을 최신순 60개씩 */
function fakeSoop(data: SoopClip[], opts: { failOn?: (q: PageQuery) => boolean } = {}) {
  const calls: PageQuery[] = [];
  const fetchPage = async (q: PageQuery) => {
    calls.push(q);
    if (opts.failOn?.(q)) throw new SoopFormatError("bad");
    const inRange = data.filter((c) => (!q.startDate || kstDate(c.regDate) >= q.startDate)
      && (!q.endDate || kstDate(c.regDate) <= q.endDate))
      .sort((a, b) => b.regDate.getTime() - a.regDate.getTime());
    const total = inRange.length;
    return { clips: inRange.slice((q.page - 1) * 60, q.page * 60), totalItems: total, totalPages: Math.ceil(total / 60) };
  };
  return { calls, fetchPage };
}
const deps = (fetchPage: SyncDeps["fetchPage"], budget = 1000): SyncDeps =>
  ({ fetchPage, now: () => NOW, budget, gapMs: 0 });
const runsCount = async () => (await db.select({ n: count() }).from(syncRuns))[0].n;

test("new clips: stops at the first page that has a known clip", async () => {
  const old = dataset(120, 1, new Date(NOW.getTime() - 2 * 3600_000), 100);
  const fresh = [mk(1, new Date(NOW.getTime() - 600_000)), mk(2, new Date(NOW.getTime() - 1200_000))];
  const s = fakeSoop([...fresh, ...old]);
  await runBackfillStepsUntilDone(fakeSoop(old).fetchPage);
  const r = await runDaily(db, deps(s.fetchPage), "daily");
  expect(r.status).toBe("ok");
  expect(r.newClips).toBe(2);
  const newPhase = s.calls.filter((q) => !q.startDate);
  expect(newPhase.map((q) => q.page)).toEqual([1]);
});

test("a held lock makes the run busy without a run record", async () => {
  await db.insert(syncState).values({ key: "lock", value: { until: new Date(NOW.getTime() + 600_000).toISOString() }, updatedAt: NOW });
  const r = await runDaily(db, deps(fakeSoop([]).fetchPage), "manual");
  expect(r.status).toBe("busy");
  expect(await runsCount()).toBe(0);
});

test("format error keeps earlier pages, records the error and releases the lock", async () => {
  const s = fakeSoop(dataset(100, 0.1), { failOn: (q) => !q.startDate && q.page === 2 });
  const r = await runDaily(db, deps(s.fetchPage), "daily");
  expect(r.status).toBe("error");
  expect((await db.select({ n: count() }).from(clips))[0].n).toBe(60);
  const [run] = await db.select().from(syncRuns);
  expect(run.error).toContain("bad");
  expect(run.finishedAt).not.toBeNull();
  const again = await runDaily(db, deps(fakeSoop([]).fetchPage), "daily");
  expect(again.status).not.toBe("busy");
});

test("budget stops the run and the next run resumes the recent range where it stopped", async () => {
  const data = dataset(300, 6); // 최근 90일 안 300개 = 5쪽
  await runBackfillStepsUntilDone(fakeSoop(data).fetchPage);
  const s1 = fakeSoop(data);
  await runDaily(db, deps(s1.fetchPage, 3), "daily");
  expect(s1.calls).toHaveLength(3);
  const lastRecent = s1.calls.filter((q) => q.startDate).at(-1)!;
  const s2 = fakeSoop(data);
  await runDaily(db, deps(s2.fetchPage, 1000), "daily");
  const firstRecent = s2.calls.find((q) => q.startDate)!;
  expect(firstRecent.page).toBe(lastRecent.page + 1);
});

test("old windows rotate so the whole range is covered in 14 runs", async () => {
  const wins = oldWindows(NOW);
  const per = Math.ceil(wins.length / 14);
  const cycle = Math.ceil(wins.length / per);
  const firstOld: string[] = [];
  for (let i = 0; i <= cycle; i++) {
    const s = fakeSoop([]);
    await runDaily(db, deps(s.fetchPage), "daily");
    const olds = s.calls.filter((q) => q.startDate && q.startDate < recentRange(NOW).start);
    firstOld.push(olds[0].startDate!);
  }
  expect(cycle).toBeLessThanOrEqual(14);
  expect(firstOld[0]).toBe(wins[0].start);
  expect(firstOld[1]).toBe(wins[per].start);
  expect(firstOld[cycle]).toBe(wins[0].start);
});

test("backfill steps until done and stores every clip", async () => {
  const data = [...dataset(150, 24 * 5), ...dataset(30, 24, parseKst("2023-03-01 00:00:00"), 5000)];
  let last;
  let steps = 0;
  do { last = await runBackfillStep(db, deps(fakeSoop(data).fetchPage, 2)); steps++; } while (!last.done && steps < 200);
  expect(last.done).toBe(true);
  expect(last.progress).toBe(1);
  expect((await db.select({ n: count() }).from(clips))[0].n).toBe(180);
  const kinds = await db.select({ k: syncRuns.kind }).from(syncRuns).where(eq(syncRuns.kind, "backfill"));
  expect(kinds.length).toBe(steps);
});

test("cron route rejects requests without the secret", async () => {
  process.env.CRON_SECRET = "s3cret";
  const res = await GET(new Request("http://localhost/api/cron"));
  expect(res.status).toBe(401);
  const res2 = await GET(new Request("http://localhost/api/cron", { headers: { authorization: "Bearer wrong" } }));
  expect(res2.status).toBe(401);
});

async function runBackfillStepsUntilDone(fetchPage: SyncDeps["fetchPage"]) {
  for (let i = 0; i < 500; i++) if ((await runBackfillStep(db, deps(fetchPage))).done) return;
  throw new Error("backfill did not finish");
}

// ── 검토 지적 C1: 형식은 맞지만 내용이 빈 응답 ─────────────────────────
test("an empty response for a range that has clips is an error and hides nothing", async () => {
  const data = dataset(20, 24);
  await runBackfillStepsUntilDone(fakeSoop(data).fetchPage);
  const r = await runDaily(db, deps(fakeSoop([]).fetchPage), "daily");
  expect(r.status).toBe("error");
  const statuses = new Set((await db.select({ s: clips.status }).from(clips)).map((x) => x.s));
  expect(statuses.has("gone")).toBe(false);
});

test("a refetch that would hide many clips at once is an error", async () => {
  const data = dataset(20, 24);
  await runBackfillStepsUntilDone(fakeSoop(data).fetchPage);
  const r = await runDaily(db, deps(fakeSoop(data.slice(0, 10)).fetchPage), "daily");
  expect(r.status).toBe("error");
  expect((await db.select({ s: clips.status }).from(clips)).filter((x) => x.s === "gone")).toHaveLength(0);
});

test("a few real deletions are still applied", async () => {
  const data = dataset(20, 24);
  await runBackfillStepsUntilDone(fakeSoop(data).fetchPage);
  const r = await runDaily(db, deps(fakeSoop(data.slice(1)).fetchPage), "daily");
  expect(r.status).toBe("ok");
  expect((await db.select({ s: clips.status }).from(clips)).filter((x) => x.s === "gone")).toHaveLength(1);
});

// ── 검토 지적 I4: 시간 기한 ─────────────────────────────────────────
test("a run stops cleanly at its deadline and releases the lock", async () => {
  const data = dataset(300, 6);
  const slow = fakeSoop(data);
  const fetchPage: SyncDeps["fetchPage"] = async (q) => { await new Promise((r) => setTimeout(r, 40)); return slow.fetchPage(q); };
  const r = await runDaily(db, { ...deps(fetchPage), deadlineMs: 150 }, "daily");
  expect(r.status).toBe("ok");
  expect(slow.calls.length).toBeLessThan(10);
  const [run] = await db.select().from(syncRuns);
  expect(run.finishedAt).not.toBeNull();
  expect((await runDaily(db, deps(fakeSoop([]).fetchPage), "daily")).status).not.toBe("busy");
});
