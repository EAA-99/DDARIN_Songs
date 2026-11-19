import { beforeEach, expect, test, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs } from "@/db/schema";
import { parseKst } from "@/lib/kst";
import type { SoopClip } from "@/lib/soop";
import {
  adminCounts, adminList, applyArtistToSameSong, editClip, mergePerformances, mergeSongs, sameSongCandidates, setStatus,
  splitPerformance,
} from "@/server/admin";
import { findOrCreateSong } from "@/server/catalog";
import { ingestClips } from "@/server/ingest";
import { createTestDb } from "./helpers/db";

let db: Db;
const NOW = parseKst("2026-11-19 10:00:00");
const c = (titleNo: number, title: string, at: string, readCnt = 1): SoopClip => ({
  titleNo, title, uploaderNick: "v", uploaderId: "v", regDate: parseKst(at), readCnt, thumbUrl: "t", durationMs: 1,
});
const clip = async (no: number) => (await db.select().from(clips).where(eq(clips.titleNo, no)))[0];
const perf = async (id: number) => (await db.select().from(performances).where(eq(performances.id, id)))[0];

beforeEach(async () => { db = await createTestDb(); });

test("editClip relinks, locks, confirms and moves the stage", async () => {
  await ingestClips(db, [c(1, "따린 - Feel Good", "2026-11-16 16:00:00"), c(2, "따린 - Feel Good", "2026-11-16 16:05:00")], NOW);
  const oldPerf = (await clip(1)).performanceId!;
  await editClip(db, 1, { songTitle: "Highlight", artist: "터치드", performers: ["따린", "구슬요"] });
  const after = await clip(1);
  expect(after).toMatchObject({ locked: true, status: "confirmed", performers: ["따린", "구슬요"], isDuet: true });
  expect(after.songId).toBe(await findOrCreateSong(db, "Highlight", "터치드"));
  expect(after.performanceId).not.toBe(oldPerf);
  expect((await perf(oldPerf)).clipCount).toBe(1);
});

test("admin edits survive the next sync", async () => {
  await ingestClips(db, [c(1, "따린 - Feel Good", "2026-11-16 16:00:00")], NOW);
  await editClip(db, 1, { songTitle: "Highlight", artist: null, performers: ["따린"] });
  const edited = await clip(1);
  await ingestClips(db, [c(1, "[클립]사탕 따는 팁", "2026-11-16 16:00:00", 77)], NOW);
  expect(await clip(1)).toMatchObject({ songId: edited.songId, status: "confirmed", performanceId: edited.performanceId, readCnt: 77 });
});

test("setStatus approves review clips and hides not-songs", async () => {
  await ingestClips(db, [c(1, "성시경 - 태양계", "2026-11-18 20:00:00"), c(2, "따린 - 숲", "2026-11-18 21:00:00")], NOW);
  expect((await clip(1)).status).toBe("review");
  await setStatus(db, [1], "confirmed");
  const one = await clip(1);
  expect(one).toMatchObject({ status: "confirmed", locked: true });
  expect((await perf(one.performanceId!)).clipCount).toBe(1);
  const stage = (await clip(2)).performanceId!;
  await setStatus(db, [2], "not_song");
  const two = await clip(2);
  expect(two).toMatchObject({ status: "not_song", songId: null, performanceId: null });
  expect((await perf(stage)).clipCount).toBe(0);
});

test("artist applied to every clip with the same title", async () => {
  await ingestClips(db, [1, 2, 3, 4, 5].map((n) => c(n, n % 2 ? "따린 - Memories" : "[클립]memories - 따린님", `2026-0${n}-01 20:00:00`)), NOW);
  expect((await sameSongCandidates(db, 1)).sort()).toEqual([2, 3, 4, 5]);
  expect(await applyArtistToSameSong(db, 1, "윤미래")).toBe(5);
  const ids = new Set((await db.select({ s: clips.songId }).from(clips)).map((r) => r.s));
  expect(ids.size).toBe(1);
  const [song] = await db.select().from(songs).where(inArray(songs.id, [...ids] as number[]));
  expect(song.originalArtist).toBe("윤미래");
});

test("mergeSongs moves clips and joins stages within 3 hours", async () => {
  const keep = await findOrCreateSong(db, "Feel Good", null);
  const drop = await findOrCreateSong(db, "필굿", null);
  await ingestClips(db, [c(1, "따린 - Feel Good", "2026-11-16 16:00:00"), c(2, "따린 - 필굿", "2026-11-16 16:30:00"), c(3, "따린 - 필굿", "2026-10-01 16:30:00")], NOW);
  await mergeSongs(db, keep, drop);
  expect(await db.select().from(songs).where(eq(songs.id, drop))).toHaveLength(0);
  const rows = await db.select().from(clips);
  expect(rows.every((r) => r.songId === keep)).toBe(true);
  expect((await clip(1)).performanceId).toBe((await clip(2)).performanceId);
  expect((await clip(3)).performanceId).not.toBe((await clip(1)).performanceId);
});

test("merge and split stages", async () => {
  await ingestClips(db, [
    c(1, "따린 - 숲", "2026-11-16 10:00:00"), c(2, "따린 - 숲", "2026-11-16 10:05:00"),
    c(3, "따린 - 숲", "2026-11-16 10:10:00"), c(4, "따린 - 숲", "2026-11-16 20:00:00"),
  ], NOW);
  const a = (await clip(1)).performanceId!;
  const b = (await clip(4)).performanceId!;
  await mergePerformances(db, a, b);
  expect((await perf(a))).toMatchObject({ clipCount: 4, locked: true });
  const created = await splitPerformance(db, a, [3, 4]);
  expect((await perf(created))).toMatchObject({ clipCount: 2, locked: true });
  expect((await perf(a))).toMatchObject({ clipCount: 2, locked: true });
});

test("counts and lists for the admin tabs", async () => {
  await ingestClips(db, [
    c(1, "성시경 - 태양계", "2026-11-18 20:00:00"), c(2, "따린 - 숲", "2026-11-18 21:00:00"),
    c(3, "[클립]사탕 따는 팁", "2026-11-18 22:00:00"), c(4, "따린 - 태양계 (성시경)", "2026-11-17 22:00:00"),
  ], NOW);
  expect(await adminCounts(db)).toEqual({ review: 1, noArtist: 1, public: 2, notSong: 1 });
  const list = await adminList(db, "review", "", 1);
  expect(list.rows.map((r) => r.titleNo)).toEqual([1]);
  expect(list.rows[0]).toMatchObject({ songTitle: "태양계", artist: "성시경" });
  expect((await adminList(db, "public", "숲", 1)).rows.map((r) => r.titleNo)).toEqual([2]);
});

test("admin actions refuse without a session and change nothing", async () => {
  vi.resetModules();
  vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
  vi.doMock("next/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));
  vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
  vi.doMock("@/db", () => ({ getDb: () => db }));
  process.env.SESSION_SECRET = "x".repeat(32);
  await ingestClips(db, [c(1, "따린 - 숲", "2026-11-18 21:00:00")], NOW);
  const actions = await import("@/app/admin/actions");
  await expect(actions.setStatusAction([1], "not_song")).rejects.toThrow("NEXT_REDIRECT");
  expect((await clip(1)).status).toBe("auto");
  vi.doUnmock("next/headers"); vi.doUnmock("next/navigation"); vi.doUnmock("next/cache"); vi.doUnmock("@/db");
});

// ── 검토 지적 I2: 노래 아님으로 잠근 클립이 다시 나타날 때 ─────────────
test("a clip marked not-a-song stays hidden after disappearing and coming back", async () => {
  const { markGone } = await import("@/server/ingest");
  await ingestClips(db, [c(1, "[로이세끼2] 윤미래 - Memories", "2026-11-17 00:30:00")], NOW);
  expect((await clip(1)).status).toBe("review");
  await setStatus(db, [1], "not_song");
  await markGone(db, new Set(), { from: parseKst("2026-11-17 00:00:00"), to: parseKst("2026-11-17 23:59:59") });
  await ingestClips(db, [c(1, "[로이세끼2] 윤미래 - Memories", "2026-11-17 00:30:00")], NOW);
  const back = await clip(1);
  expect(back.status).toBe("not_song");
  expect(back.performanceId).toBeNull();
});

// ── 검토 지적 I3: 갱신이 기존 클립의 상태를 다시 쓰지 않음 ─────────────
test("refreshing views never writes the status of a clip that is not gone", async () => {
  await ingestClips(db, [c(1, "따린 - 숲", "2026-11-18 21:00:00")], NOW);
  const writes: Record<string, unknown>[] = [];
  const spy = new Proxy(db, {
    get(t, p, r) {
      if (p !== "update") return Reflect.get(t, p, r);
      return (table: unknown) => {
        const b = t.update(table as typeof clips);
        return new Proxy(b, { get(bt, bp, br) {
          if (bp !== "set") return Reflect.get(bt, bp, br);
          return (v: Record<string, unknown>) => { if (table === clips) writes.push(v); return bt.set(v as never); };
        } });
      };
    },
  }) as Db;
  await ingestClips(spy, [c(1, "따린 - 숲", "2026-11-18 21:00:00", 50)], NOW);
  expect(writes.length).toBeGreaterThan(0);
  expect(writes.every((w) => !("status" in w))).toBe(true);
  expect((await clip(1)).readCnt).toBe(50);
});

// ── 검토 지적 I6: 관리자 변경 뒤 공개 캐시를 비움 ─────────────────────
test("admin actions expire the public catalog cache", async () => {
  vi.resetModules();
  const tags: string[] = [];
  vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "ok" }) }) }));
  vi.doMock("@/server/session", () => ({ requireAdmin: async () => {} }));
  vi.doMock("next/cache", () => ({ revalidatePath: () => {}, updateTag: (t: string) => tags.push(t), revalidateTag: () => {} }));
  vi.doMock("@/db", () => ({ getDb: () => db }));
  await ingestClips(db, [c(1, "따린 - 숲", "2026-11-18 21:00:00")], NOW);
  const actions = await import("@/app/admin/actions");
  await actions.setStatusAction([1], "not_song");
  expect(tags).toContain("catalog");
  vi.doUnmock("next/headers"); vi.doUnmock("@/server/session"); vi.doUnmock("next/cache"); vi.doUnmock("@/db");
});
