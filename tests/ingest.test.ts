import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances } from "@/db/schema";
import { parseKst } from "@/lib/kst";
import type { SoopClip } from "@/lib/soop";
import { findOrCreateSong } from "@/server/catalog";
import { ingestClips, markGone } from "@/server/ingest";
import { createTestDb } from "./helpers/db";

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

const now = parseKst("2026-11-19 04:00:00");
const soop = (titleNo: number, title: string, at = "2026-11-17 01:00:00", readCnt = 10): SoopClip => ({
  titleNo, title, uploaderNick: "v", uploaderId: "v1", regDate: parseKst(at), readCnt,
  thumbUrl: "https://x/t.jpg", durationMs: 60000,
});
const clip = async (no: number) => (await db.select().from(clips).where(eq(clips.titleNo, no)))[0];

test("new song clip is classified, linked and staged", async () => {
  const r = await ingestClips(db, [soop(1, "따린 - Feel Good")], now);
  expect(r).toEqual({ inserted: 1, updated: 0 });
  const c = await clip(1);
  expect(c.status).toBe("auto");
  expect(c.songId).not.toBeNull();
  expect(c.performanceId).not.toBeNull();
  expect(c.performers).toEqual(["따린"]);
});

test("seen again: only views change", async () => {
  await ingestClips(db, [soop(1, "따린 - Feel Good", undefined, 10)], now);
  const before = await clip(1);
  const r = await ingestClips(db, [soop(1, "따린 - Feel Good", undefined, 99)], now);
  expect(r).toEqual({ inserted: 0, updated: 1 });
  const after = await clip(1);
  expect(after.readCnt).toBe(99);
  expect(after.songId).toBe(before.songId);
  expect(after.performanceId).toBe(before.performanceId);
  const p = (await db.select().from(performances).where(eq(performances.id, after.performanceId!)))[0];
  expect(p.bestReadCnt).toBe(99);
});

test("locked clip keeps admin values even if the title changes", async () => {
  await ingestClips(db, [soop(1, "따린 - Feel Good")], now);
  const other = await findOrCreateSong(db, "Highlight", null);
  await db.update(clips).set({ songId: other, status: "confirmed", locked: true }).where(eq(clips.titleNo, 1));
  const before = await clip(1);
  await ingestClips(db, [soop(1, "[클립]따린 더빙", undefined, 50)], now);
  const after = await clip(1);
  expect(after.readCnt).toBe(50);
  expect(after.songId).toBe(other);
  expect(after.status).toBe("confirmed");
  expect(after.performanceId).toBe(before.performanceId);
});

test("not a song: no song, no stage", async () => {
  await ingestClips(db, [soop(2, "[클립]사탕 따는 팁")], now);
  const c = await clip(2);
  expect(c.status).toBe("not_song");
  expect(c.songId).toBeNull();
  expect(c.performanceId).toBeNull();
});

test("original artist is borrowed from a known song of the same title", async () => {
  await findOrCreateSong(db, "Memories", "윤미래");
  await ingestClips(db, [soop(3, "따린 - Memories")], now);
  const c = await clip(3);
  expect(c.songId).toBe(await findOrCreateSong(db, "Memories", "윤미래"));
});

test("known partners from earlier clips are used", async () => {
  await ingestClips(db, [soop(4, "[클립]8282 - 구슬요x따린 Cover", "2026-11-15 14:00:00")], now);
  await ingestClips(db, [soop(5, "[클립]구슬요 - 안동역에서", "2026-11-15 15:00:00")], now);
  expect((await clip(5)).status).toBe("not_song");
});

test("markGone hides clips missing from a refetched range and restores them when back", async () => {
  await ingestClips(db, [
    soop(1, "따린 - Feel Good", "2026-11-17 01:00:00", 5),
    soop(2, "[클립]따린-Feel good", "2026-11-17 01:10:00", 40),
    soop(3, "따린 - Feel Good (짧)", "2026-11-17 01:20:00", 7),
    soop(9, "따린 - Snowman", "2026-10-01 01:00:00", 3),
  ], now);
  const n = await markGone(db, new Set([1, 3]), { from: parseKst("2026-11-17 00:00:00"), to: parseKst("2026-11-17 23:59:59") });
  expect(n).toBe(1);
  expect((await clip(2)).status).toBe("gone");
  expect((await clip(9)).status).toBe("auto");
  const p = (await db.select().from(performances).where(eq(performances.id, (await clip(1)).performanceId!)))[0];
  expect(p.bestReadCnt).toBe(7);

  await ingestClips(db, [soop(2, "[클립]따린-Feel good", "2026-11-17 01:10:00", 41)], now);
  expect((await clip(2)).status).toBe("auto");
});
