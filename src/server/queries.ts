import { and, asc, count, desc, eq, gt, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs } from "@/db/schema";
import { kstMonthStart, kstWeekStart } from "@/lib/kst";
import { norm } from "@/lib/normalize";
import { PUBLIC_STATUSES } from "./catalog";

export const PAGE_SIZE = 20;

export type PerfRow = {
  id: number;
  songTitle: string;
  songSlug: string;
  artist: string | null;
  startedAt: Date;
  isDuet: boolean;
  performers: string[];
  clipCount: number;
  best: { titleNo: number; readCnt: number; thumbUrl: string; durationMs: number };
};

const perfSelect = {
  id: performances.id,
  songTitle: songs.title,
  songSlug: songs.slug,
  artist: songs.originalArtist,
  startedAt: performances.startedAt,
  isDuet: performances.isDuet,
  performers: performances.performers,
  clipCount: performances.clipCount,
  bestNo: performances.bestClipNo,
  bestRead: performances.bestReadCnt,
  thumbUrl: clips.thumbUrl,
  durationMs: clips.durationMs,
};

type RawPerf = {
  id: number; songTitle: string; songSlug: string; artist: string | null; startedAt: Date; isDuet: boolean;
  performers: string[]; clipCount: number; bestNo: number | null; bestRead: number;
  thumbUrl: string | null; durationMs: number | null;
};

function toRow(r: RawPerf): PerfRow {
  return {
    id: r.id, songTitle: r.songTitle, songSlug: r.songSlug, artist: r.artist, startedAt: r.startedAt,
    isDuet: r.isDuet, performers: r.performers, clipCount: r.clipCount,
    best: { titleNo: r.bestNo ?? 0, readCnt: r.bestRead, thumbUrl: r.thumbUrl ?? "", durationMs: r.durationMs ?? 0 },
  };
}

async function selectPerfs(db: Db, where: SQL | undefined, order: SQL[], limit?: number, offset = 0): Promise<PerfRow[]> {
  let q = db.select(perfSelect).from(performances)
    .innerJoin(songs, eq(songs.id, performances.songId))
    .leftJoin(clips, eq(clips.titleNo, performances.bestClipNo))
    .where(and(gt(performances.clipCount, 0), where))
    .orderBy(...order)
    .$dynamic();
  if (limit) q = q.limit(limit).offset(offset);
  return (await q).map(toRow);
}

const ORDER = {
  latest: [desc(performances.startedAt), desc(performances.id)],
  views: [desc(performances.bestReadCnt), desc(performances.startedAt)],
};

function textMatch(q: string): SQL | undefined {
  const n = norm(q);
  if (!n) return undefined;
  const like = `%${n}%`;
  return sql`(${songs.titleNorm} like ${like} or coalesce(${songs.artistNorm}, '') like ${like}
    or exists (select 1 from unnest(${performances.performersNorm}) as p(n) where p.n like ${like}))`;
}

/** 첫 화면 목록: 무대 단위, 검색(곡명·원곡 가수·부른 사람) + 솔로/듀엣 + 최신순/조회수순, 20개씩 */
export async function searchPerformances(db: Db, p: {
  q?: string; type?: "all" | "solo" | "duet"; sort?: "latest" | "views"; page?: number;
}): Promise<{ rows: PerfRow[]; total: number; songs: number; clips: number }> {
  const where = and(
    p.q ? textMatch(p.q) : undefined,
    p.type === "solo" ? eq(performances.isDuet, false) : p.type === "duet" ? eq(performances.isDuet, true) : undefined,
  );
  const page = Math.max(1, p.page ?? 1);
  const rows = await selectPerfs(db, where, ORDER[p.sort ?? "latest"], PAGE_SIZE, (page - 1) * PAGE_SIZE);
  // total은 페이지 계산용(무대 수), songs·clips는 시청자 화면에 보이는 숫자
  const [c] = await db.select({
    n: count(),
    songs: sql<number>`count(distinct ${performances.songId})`.mapWith(Number),
    clips: sql<number>`coalesce(sum(${performances.clipCount}), 0)`.mapWith(Number),
  }).from(performances)
    .innerJoin(songs, eq(songs.id, performances.songId))
    .where(and(gt(performances.clipCount, 0), where));
  return { rows, total: c.n, songs: c.songs, clips: c.clips };
}

/** 무대를 펼쳤을 때 보이는 공개 클립(조회수순) */
export async function performanceClips(db: Db, performanceId: number) {
  return db.select({
    titleNo: clips.titleNo, readCnt: clips.readCnt, uploaderNick: clips.uploaderNick,
    regDate: clips.regDate, thumbUrl: clips.thumbUrl, durationMs: clips.durationMs,
  }).from(clips)
    .where(and(eq(clips.performanceId, performanceId), inArray(clips.status, [...PUBLIC_STATUSES])))
    .orderBy(desc(clips.readCnt), asc(clips.regDate));
}

export type ClipItem = Awaited<ReturnType<typeof performanceClips>>[number];

/** 여러 무대의 공개 클립을 한 번에(목록 화면의 "클립 N개" 펼치기용) */
export async function clipsForPerformances(db: Db, ids: number[]): Promise<Map<number, ClipItem[]>> {
  const map = new Map<number, ClipItem[]>();
  if (ids.length === 0) return map;
  const rows = await db.select({
    performanceId: clips.performanceId, titleNo: clips.titleNo, readCnt: clips.readCnt, uploaderNick: clips.uploaderNick,
    regDate: clips.regDate, thumbUrl: clips.thumbUrl, durationMs: clips.durationMs,
  }).from(clips)
    .where(and(inArray(clips.performanceId, ids), inArray(clips.status, [...PUBLIC_STATUSES])))
    .orderBy(desc(clips.readCnt), asc(clips.regDate));
  for (const { performanceId, ...c } of rows) {
    const list = map.get(performanceId!) ?? [];
    list.push(c);
    map.set(performanceId!, list);
  }
  return map;
}

/** 조회수 TOP 10(무대마다 대표 클립 하나, 같은 곡은 가장 높은 무대 하나만). 기간은 KST 기준 */
export async function topViews(db: Db, period: "week" | "month" | "all", now: Date): Promise<PerfRow[]> {
  const from = period === "week" ? kstWeekStart(now) : period === "month" ? kstMonthStart(now) : null;
  const rows = await selectPerfs(db, from ? gte(performances.startedAt, from) : undefined, ORDER.views, 100);
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.songSlug) && seen.add(r.songSlug)).slice(0, 10);
}

/** 첫 화면 소개용 숫자: 공개 무대·곡·클립 수 */
export async function siteStats(db: Db) {
  const [r] = await db.select({
    stages: count(performances.id),
    songs: sql<number>`count(distinct ${performances.songId})`.mapWith(Number),
    clips: sql<number>`coalesce(sum(${performances.clipCount}), 0)`.mapWith(Number),
  }).from(performances).where(gt(performances.clipCount, 0));
  return r;
}

/** 많이 부른 곡 TOP 10(무대 수) */
export async function topSongs(db: Db) {
  const stages = count(performances.id);
  const rows = await db.select({ title: songs.title, slug: songs.slug, artist: songs.originalArtist, performances: stages })
    .from(songs).innerJoin(performances, and(eq(performances.songId, songs.id), gt(performances.clipCount, 0)))
    .groupBy(songs.id).orderBy(desc(stages), desc(sql`max(${performances.startedAt})`)).limit(10);
  return rows;
}

/** 곡 페이지 */
export async function songPage(db: Db, slug: string, sort: "latest" | "views") {
  const [song] = await db.select().from(songs).where(eq(songs.slug, slug));
  if (!song) return null;
  const list = await selectPerfs(db, eq(performances.songId, song.id), ORDER[sort]);
  if (list.length === 0) return null;
  return {
    song: { title: song.title, slug: song.slug, artist: song.originalArtist },
    performances: list,
    clipCount: list.reduce((a, r) => a + r.clipCount, 0),
  };
}

/** 가수 페이지: 원곡 가수로서의 곡 목록 + 따린님과 함께 부른 무대. 이름은 정규화해서 비교한다. */
export async function artistPage(db: Db, name: string) {
  const n = norm(name);
  if (!n) return null;
  const stages = count(performances.id);
  const asOriginal = await db.select({
    title: songs.title, slug: songs.slug, performances: stages,
    clips: sql<number>`sum(${performances.clipCount})`.mapWith(Number),
  })
    .from(songs).innerJoin(performances, and(eq(performances.songId, songs.id), gt(performances.clipCount, 0)))
    .where(eq(songs.artistNorm, n)).groupBy(songs.id).orderBy(desc(stages), asc(songs.title));
  const asPartner = n === norm("따린") ? [] : await selectPerfs(db,
    sql`${n} = any(${performances.performersNorm})`, ORDER.latest);
  if (asOriginal.length === 0 && asPartner.length === 0) return null;
  const [display] = asOriginal.length
    ? await db.select({ a: songs.originalArtist }).from(songs).where(eq(songs.artistNorm, n)).limit(1)
    : [{ a: asPartner[0].performers.find((p) => norm(p) === n) ?? name }];
  return { name: display?.a ?? name, asOriginal, asPartner };
}
