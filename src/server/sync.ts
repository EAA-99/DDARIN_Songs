import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, syncRuns, syncState } from "@/db/schema";
import { kstDate, parseKst } from "@/lib/kst";
import { Throttle, type ClipPage, type PageQuery } from "@/lib/soop";
import { ingestClips, loadPartners, markGone } from "./ingest";

export const FIRST_DAY = "2023-01-01";
const RECENT_DAYS = 90;
const ROTATION_DAYS = 14;
const LOCK_MS = 15 * 60_000;
const DEFAULT_BUDGET = 150;
const DEFAULT_DEADLINE_MS = 240_000; // Vercel 함수 제한(300초) 전에 깔끔하게 멈춘다

export type SyncDeps = {
  fetchPage: (q: PageQuery) => Promise<ClipPage>;
  now: () => Date;
  budget?: number;
  gapMs?: number;
  deadlineMs?: number;
};
export type SyncResult = { status: "ok" | "busy" | "error"; newClips: number; updatedViews: number; error?: string };
type Win = { start: string; end: string };

// ── 기간 계산 ────────────────────────────────────────────────────────────
const addDays = (d: string, n: number) => kstDate(new Date(parseKst(`${d} 12:00:00`).getTime() + n * 86400_000));

function monthWindows(from: string, to: string, months: number): Win[] {
  const out: Win[] = [];
  let [y, m] = from.split("-").map(Number);
  let start = from;
  while (start <= to) {
    m += months;
    while (m > 12) { m -= 12; y++; }
    const nextStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = addDays(nextStart, -1);
    out.push({ start, end: end < to ? end : to });
    start = nextStart;
  }
  return out;
}

export const recentRange = (now: Date): Win => ({ start: kstDate(new Date(now.getTime() - RECENT_DAYS * 86400_000)), end: kstDate(now) });
export const oldWindows = (now: Date): Win[] => monthWindows(FIRST_DAY, addDays(recentRange(now).start, -1), 1);
export const backfillWindows = (now: Date): Win[] => monthWindows(FIRST_DAY, kstDate(now), 3);

// ── 상태·잠금 ────────────────────────────────────────────────────────────
async function getState<T>(db: Db, key: string): Promise<T | null> {
  const [row] = await db.select().from(syncState).where(eq(syncState.key, key));
  return (row?.value as T) ?? null;
}
async function setState(db: Db, key: string, value: unknown, now: Date): Promise<void> {
  await db.insert(syncState).values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: syncState.key, set: { value, updatedAt: now } });
}
async function clearState(db: Db, key: string): Promise<void> {
  await db.delete(syncState).where(eq(syncState.key, key));
}

/** 다른 실행이 잡고 있지 않거나 만료(15분)됐을 때만 잠근다. 한 문장(조건부 upsert)이라 겹쳐도 하나만 성공. */
async function acquireLock(db: Db, now: Date): Promise<boolean> {
  const value = { until: new Date(now.getTime() + LOCK_MS).toISOString() };
  const rows = await db.insert(syncState).values({ key: "lock", value, updatedAt: now })
    .onConflictDoUpdate({
      target: syncState.key, set: { value, updatedAt: now },
      setWhere: sql`(${syncState.value}->>'until')::timestamptz < ${now.toISOString()}::timestamptz`,
    }).returning({ key: syncState.key });
  return rows.length > 0;
}
const releaseLock = (db: Db) => clearState(db, "lock");

// ── 요청 ────────────────────────────────────────────────────────────────
class BudgetOut extends Error {}

type Ctx = {
  db: Db; now: Date; fetch: (q: PageQuery) => Promise<ClipPage>;
  tally: { newClips: number; updatedViews: number }; partners?: Set<string>;
};

function makeCtx(db: Db, deps: SyncDeps): Ctx {
  const throttle = new Throttle(1, deps.gapMs ?? 300);
  let left = deps.budget ?? DEFAULT_BUDGET;
  const deadline = Date.now() + (deps.deadlineMs ?? DEFAULT_DEADLINE_MS);
  return {
    db, now: deps.now(), tally: { newClips: 0, updatedViews: 0 },
    fetch: (q) => {
      if (left <= 0 || Date.now() >= deadline) throw new BudgetOut();
      left--;
      return throttle.run(() => deps.fetchPage(q));
    },
  };
}

async function ingest(ctx: Ctx, list: ClipPage["clips"]) {
  ctx.partners ??= await loadPartners(ctx.db); // 실행마다 한 번만 읽고, 새로 알게 된 이름은 ingestClips가 더한다
  const r = await ingestClips(ctx.db, list, ctx.now, ctx.partners);
  ctx.tally.newClips += r.inserted;
  ctx.tally.updatedViews += r.updated;
}

/** 기간 하나를 startPage부터 끝까지 받는다. 쪽마다 진행 위치를 저장(save). 처음부터 끝까지 받았으면 삭제 확인. */
async function fetchWindow(ctx: Ctx, w: Win, startPage: number, save: (nextPage: number) => Promise<void>): Promise<void> {
  const seen = new Set<number>();
  for (let p = startPage; ; p++) {
    const r = await ctx.fetch({ page: p, orderBy: "reg_date", startDate: w.start, endDate: w.end });
    await ingest(ctx, r.clips);
    r.clips.forEach((c) => seen.add(c.titleNo));
    if (p >= r.totalPages) break;
    await save(p + 1);
  }
  if (startPage === 1) {
    await markGone(ctx.db, seen, { from: parseKst(`${w.start} 00:00:00`), to: parseKst(`${w.end} 23:59:59`) }, { guard: true });
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function withRun<T extends object>(db: Db, deps: SyncDeps, kind: "daily" | "manual" | "backfill",
  body: (ctx: Ctx) => Promise<T>): Promise<(SyncResult & Partial<T>)> {
  const ctx = makeCtx(db, deps);
  if (!(await acquireLock(db, ctx.now))) return { status: "busy", newClips: 0, updatedViews: 0 } as SyncResult & Partial<T>;
  const [run] = await db.insert(syncRuns).values({ kind, startedAt: ctx.now }).returning({ id: syncRuns.id });
  let error: string | undefined;
  let extra: Partial<T> = {};
  try {
    extra = await body(ctx);
  } catch (e) {
    if (!(e instanceof BudgetOut)) error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    await db.update(syncRuns).set({
      finishedAt: new Date(), newClips: ctx.tally.newClips, updatedViews: ctx.tally.updatedViews, error: error ?? null,
    }).where(eq(syncRuns.id, run.id));
    await releaseLock(db);
  }
  return { status: error ? "error" : "ok", ...ctx.tally, ...(error ? { error } : {}), ...extra };
}

/** 매일 갱신(스펙 7장): ① 새 클립 ② 최근 90일 조회수·삭제 ③ 오래된 기간 순환. 예산을 넘으면 위치를 저장하고 멈춘다. */
export function runDaily(db: Db, deps: SyncDeps, kind: "daily" | "manual"): Promise<SyncResult> {
  return withRun(db, deps, kind, async (ctx) => {
    const recent = recentRange(ctx.now);

    // ① 새 클립: 최신순으로 받다가 이미 아는 클립이 나오면(또는 최근 범위를 벗어나면) 멈춤
    for (let p = 1; ; p++) {
      const r = await ctx.fetch({ page: p, orderBy: "reg_date" });
      if (r.clips.length === 0) break;
      const known = await db.select({ no: clips.titleNo }).from(clips)
        .where(inArray(clips.titleNo, r.clips.map((c) => c.titleNo)));
      const inRecent = r.clips.filter((c) => kstDate(c.regDate) >= recent.start);
      await ingest(ctx, inRecent);
      if (known.length > 0 || inRecent.length < r.clips.length || p >= r.totalPages) break;
    }

    // ② 최근 90일: 이어받을 위치가 있으면 그 기간·쪽부터
    const rs = (await getState<Win & { page: number }>(db, "recent")) ?? { ...recent, page: 1 };
    await fetchWindow(ctx, rs, rs.page, (page) => setState(db, "recent", { ...rs, page }, ctx.now));
    await clearState(db, "recent");

    // ③ 오래된 기간: 하루에 ceil(창 수/14)개씩 돌아가며
    const wins = oldWindows(ctx.now);
    if (wins.length === 0) return {};
    const per = Math.ceil(wins.length / ROTATION_DAYS);
    let rot = (await getState<{ idx: number; page: number }>(db, "rotation")) ?? { idx: 0, page: 1 };
    for (let k = 0; k < per; k++) {
      const idx = rot.idx % wins.length;
      await fetchWindow(ctx, wins[idx], rot.page, (page) => setState(db, "rotation", { idx, page }, ctx.now));
      rot = { idx: (idx + 1) % wins.length, page: 1 };
      await setState(db, "rotation", rot, ctx.now);
    }
    return {};
  });
}

/** 첫 전체 수집 한 걸음: 2023-01-01부터 3개월 창을 차례로, 예산만큼 받고 위치를 저장. */
export function runBackfillStep(db: Db, deps: SyncDeps): Promise<SyncResult & { done: boolean; progress: number }> {
  const result = { done: false, progress: 0 };
  return withRun(db, deps, "backfill", async (ctx) => {
    const wins = backfillWindows(ctx.now);
    let st = (await getState<{ idx: number; page: number }>(db, "backfill")) ?? { idx: 0, page: 1 };
    const progress = () => { result.progress = Math.min(1, st.idx / wins.length); result.done = st.idx >= wins.length; };
    try {
      while (st.idx < wins.length) {
        const idx = st.idx;
        await fetchWindow(ctx, wins[idx], st.page, async (page) => { st = { idx, page }; await setState(db, "backfill", st, ctx.now); });
        st = { idx: idx + 1, page: 1 };
        await setState(db, "backfill", st, ctx.now);
      }
    } finally {
      progress();
    }
    return result;
  }).then((r) => ({ ...r, done: result.done, progress: result.progress }));
}
