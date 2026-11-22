import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs, titleChecks } from "@/db/schema";
import { DeezerError, type SongLookup } from "@/lib/deezer";
import { parseKst } from "@/lib/kst";
import { parseTitle } from "@/lib/parse-title";
import type { SoopClip } from "@/lib/soop";
import { ingestClips } from "@/server/ingest";
import { decide, lookupCached, recheckClips } from "@/server/verify";
import { createTestDb } from "./helpers/db";

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

const now = parseKst("2026-11-22 04:00:00");
const DAY = 86400_000;

/** 곡명 → 결과. 부른 곡명을 기록한다. "에러"로 시작하는 곡명은 오류 */
function fakeLookup(table: Record<string, string | null>) {
  const calls: string[] = [];
  const lookup: SongLookup = async (t) => {
    calls.push(t);
    if (t.startsWith("에러")) throw new DeezerError("down");
    return t in table ? { found: true, artist: table[t] } : { found: false, artist: null };
  };
  return { lookup, calls };
}

test("lookupCached: reuses a stored result", async () => {
  const f = fakeLookup({ 사미인곡: "Seo Moon Tak" });
  expect(await lookupCached(db, "사미인곡", f.lookup, now)).toEqual({ found: true, artist: "Seo Moon Tak" });
  expect(await lookupCached(db, "사미 인곡", f.lookup, now)).toEqual({ found: true, artist: "Seo Moon Tak" });
  expect(f.calls).toEqual(["사미인곡"]);
});

test("lookupCached: not-found is asked again after 30 days", async () => {
  const f = fakeLookup({});
  await lookupCached(db, "캐치캐치", f.lookup, now);
  await lookupCached(db, "캐치캐치", f.lookup, new Date(now.getTime() + 29 * DAY));
  expect(f.calls).toHaveLength(1);
  await lookupCached(db, "캐치캐치", f.lookup, new Date(now.getTime() + 31 * DAY));
  expect(f.calls).toHaveLength(2);
});

test("lookupCached: an error is not stored", async () => {
  const f = fakeLookup({});
  expect(await lookupCached(db, "에러x", f.lookup, now)).toBe("error");
  expect(await db.select().from(titleChecks)).toHaveLength(0);
});

test.each([
  ["따린 - 귀로 (나얼)", {}, "auto", "나얼", false, 0],
  ["따린 - Feel Good", { "Feel Good": "Pharrell" }, "auto", "Pharrell", false, 1],
  ["따린 - Feel Good", {}, "review", null, false, 1],
  ["따린 놀리기 -1", { "1": "X" }, "review", "놀리기", false, 0],
  ["[로이세끼2] 윤미래 - Memories", {}, "review", "윤미래", false, 0],
  ["[클립]따린의 김건모 - 서울의 달", { "서울의 달": "GUNTAC" }, "auto", "김건모", false, 1],
] as [string, Record<string, string>, string, string | null, boolean, number][])(
  "decide %s", async (raw, table, status, artist, unverified, calls) => {
    const f = fakeLookup(table);
    expect(await decide(db, parseTitle(raw), new Set(), f.lookup, now)).toEqual({ status, artist, unverified });
    expect(f.calls).toHaveLength(calls);
  });

test("decide: a known song needs no lookup; an error keeps it for later", async () => {
  const f = fakeLookup({});
  expect(await decide(db, parseTitle("따린 - 캐치캐치"), new Set(["캐치캐치"]), f.lookup, now))
    .toEqual({ status: "auto", artist: null, unverified: false });
  expect(f.calls).toHaveLength(0);
  expect(await decide(db, parseTitle("따린 - 에러남"), new Set(), f.lookup, now))
    .toEqual({ status: "review", artist: null, unverified: true });
});

// ── 새 클립 수집 ──
const soop = (titleNo: number, title: string, at = "2026-11-20 01:00:00"): SoopClip => ({
  titleNo, title, uploaderNick: "v", uploaderId: "v1", regDate: parseKst(at), readCnt: 10,
  thumbUrl: "https://x/t.jpg", durationMs: 60000,
});
const clip = async (no: number) => (await db.select().from(clips).where(eq(clips.titleNo, no)))[0];

test("ingest with lookup: chat clip is held, a real song is published with its artist", async () => {
  const f = fakeLookup({ 사미인곡: "Seo Moon Tak" });
  await ingestClips(db, [soop(1, "[클립]머독 하이드로펌프-따린"), soop(2, "사미인곡 - 따린")], now, undefined, undefined, f.lookup);
  const chat = await clip(1);
  expect(chat.status).toBe("review");
  const [p] = await db.select().from(performances).where(eq(performances.id, chat.performanceId!));
  expect(p.clipCount).toBe(0);
  const song = await clip(2);
  expect(song.status).toBe("auto");
  const [s] = await db.select().from(songs).where(eq(songs.id, song.songId!));
  expect(s.originalArtist).toBe("Seo Moon Tak");
});

test("ingest with lookup: same title twice asks once; error marks unverified", async () => {
  const f = fakeLookup({ Golden: "HUNTR/X" });
  await ingestClips(db, [soop(1, "Golden - 따린"), soop(2, "따린 - Golden", "2026-11-21 01:00:00"), soop(3, "따린 - 에러남")],
    now, undefined, undefined, f.lookup);
  expect(f.calls.filter((t) => t === "Golden")).toHaveLength(1);
  expect((await clip(3))).toMatchObject({ status: "review", unverified: true });
});

// ── 다시 검사 ──

test("recheck auto: chat clips go to review, locked stay, 원본 becomes not_song, songs with 2+ stages stay", async () => {
  // 옛 규칙(lookup 없이)으로 들어온 상태를 만든다
  await ingestClips(db, [
    soop(1, "[클립]머독 하이드로펌프-따린"),
    soop(2, "[클립]우정잉과 머독의 결혼식-따린"),
    soop(3, "따린 - 캐치캐치", "2026-11-01 01:00:00"),
    soop(4, "따린 - 캐치캐치", "2026-11-10 01:00:00"),
    soop(5, "따린&마냥 - Nobody Knows 원본"),
    soop(6, "따린 놀리기 -1"),
    soop(7, "따린 - 귀로 (나얼)"),
  ], now);
  await db.update(clips).set({ status: "auto" }).where(eq(clips.titleNo, 5)); // 옛 규칙에선 auto였던 것처럼
  await db.update(clips).set({ locked: true }).where(eq(clips.titleNo, 2));
  const f = fakeLookup({});
  const r = await recheckClips(db, "auto", f.lookup, now);
  expect((await clip(1)).status).toBe("review");
  expect((await clip(2)).status).toBe("auto");
  expect((await clip(3)).status).toBe("auto");
  expect((await clip(4)).status).toBe("auto");
  expect((await clip(5)).status).toBe("not_song");
  expect((await clip(6)).status).toBe("review");
  expect((await clip(7)).status).toBe("auto");
  expect(r).toMatchObject({ demoted: 2, notSong: 1 });
  const [p] = await db.select().from(performances).where(eq(performances.id, (await clip(1)).performanceId!));
  expect(p.clipCount).toBe(0);
});

test("recheck unverified: found this time → auto and flag cleared", async () => {
  await ingestClips(db, [soop(1, "따린 - 에러골든")], now, undefined, undefined, fakeLookup({}).lookup);
  expect(await clip(1)).toMatchObject({ status: "review", unverified: true });
  const ok: SongLookup = async () => ({ found: true, artist: "HUNTR/X" });
  const r = await recheckClips(db, "unverified", ok, now);
  expect(await clip(1)).toMatchObject({ status: "auto", unverified: false });
  expect(r.promoted).toBe(1);
  const [p] = await db.select().from(performances).where(eq(performances.id, (await clip(1)).performanceId!));
  expect(p.clipCount).toBe(1);
});
