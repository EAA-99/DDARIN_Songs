import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs } from "@/db/schema";
import { norm, slugify } from "@/lib/normalize";

export const PUBLIC_STATUSES = ["auto", "confirmed"] as const;
const STAGE_WINDOW_SEC = 3 * 3600;

async function uniqueSlug(db: Db, title: string): Promise<string> {
  const base = slugify(title);
  const taken = new Set((await db.select({ s: songs.slug }).from(songs)
    .where(sql`${songs.slug} = ${base} or ${songs.slug} like ${base + "-%"}`)).map((r) => r.s));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** 정규화 곡명이 같고 가수가 같거나 한쪽이 비었으면 같은 곡. 비어 있던 가수는 채운다. */
export async function findOrCreateSong(db: Db, title: string, artist: string | null): Promise<number> {
  const tn = norm(title);
  const an = artist ? norm(artist) : null;
  const rows = await db.select().from(songs).where(eq(songs.titleNorm, tn)).orderBy(asc(songs.id));
  const match = an
    ? rows.find((r) => r.artistNorm === an) ?? rows.find((r) => r.artistNorm === null)
    : rows[0];
  if (match) {
    if (an && match.artistNorm === null) {
      await db.update(songs).set({ originalArtist: artist, artistNorm: an }).where(eq(songs.id, match.id));
    }
    return match.id;
  }
  const [row] = await db.insert(songs).values({
    slug: await uniqueSlug(db, title), title: title.trim(), titleNorm: tn, originalArtist: artist, artistNorm: an,
  }).returning({ id: songs.id });
  return row.id;
}

/** 같은 정규화 곡명의 곡 중 원곡 가수가 있는 것 */
export async function guessArtist(db: Db, title: string): Promise<string | null> {
  const [row] = await db.select({ a: songs.originalArtist }).from(songs)
    .where(and(eq(songs.titleNorm, norm(title)), isNotNull(songs.originalArtist))).orderBy(asc(songs.id)).limit(1);
  return row?.a ?? null;
}

/** 같은 곡이고 등록 시각이 3시간 안인 클립의 무대에 넣는다(가장 가까운 클립 기준). 없으면 새 무대. */
export async function assignPerformance(db: Db, clipNo: number): Promise<number> {
  const [clip] = await db.select().from(clips).where(eq(clips.titleNo, clipNo));
  if (!clip?.songId) throw new Error(`곡이 없는 클립은 무대에 넣을 수 없습니다: ${clipNo}`);
  const t = clip.regDate.toISOString();
  const [near] = await db.select({ p: clips.performanceId }).from(clips).where(and(
    eq(clips.songId, clip.songId), isNotNull(clips.performanceId), ne(clips.titleNo, clipNo),
    sql`abs(extract(epoch from ${clips.regDate} - ${t}::timestamptz)) <= ${STAGE_WINDOW_SEC}`,
  )).orderBy(sql`abs(extract(epoch from ${clips.regDate} - ${t}::timestamptz))`).limit(1);
  let id = near?.p ?? null;
  if (id === null) {
    const [row] = await db.insert(performances).values({ songId: clip.songId, startedAt: clip.regDate })
      .returning({ id: performances.id });
    id = row.id;
  }
  await db.update(clips).set({ performanceId: id }).where(eq(clips.titleNo, clipNo));
  await refreshPerformance(db, id);
  return id;
}

/** 공개 클립 기준으로 무대의 시작 시각·대표 클립·클립 수·부른 사람을 다시 계산한다. */
export async function refreshPerformance(db: Db, performanceId: number): Promise<void> {
  const rows = await db.select().from(clips).where(and(
    eq(clips.performanceId, performanceId), inArray(clips.status, [...PUBLIC_STATUSES])));
  if (rows.length === 0) {
    await db.update(performances).set({ clipCount: 0, bestClipNo: null, bestReadCnt: 0 })
      .where(eq(performances.id, performanceId));
    return;
  }
  const best = rows.reduce((a, b) => (b.readCnt > a.readCnt ? b : a));
  const performers = [...new Set(rows.flatMap((r) => r.performers))];
  await db.update(performances).set({
    startedAt: new Date(Math.min(...rows.map((r) => r.regDate.getTime()))),
    bestClipNo: best.titleNo,
    bestReadCnt: best.readCnt,
    clipCount: rows.length,
    performers,
    performersNorm: performers.map(norm),
    isDuet: performers.length > 1,
  }).where(eq(performances.id, performanceId));
}
