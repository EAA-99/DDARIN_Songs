import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs } from "@/db/schema";
import { norm } from "@/lib/normalize";
import { assignPerformance, findOrCreateSong, PUBLIC_STATUSES, refreshPerformance } from "./catalog";

const STAGE_WINDOW_MS = 3 * 3600_000;
export const ADMIN_PAGE_SIZE = 50;

async function clipRow(db: Db, titleNo: number) {
  const [row] = await db.select().from(clips).where(eq(clips.titleNo, titleNo));
  if (!row) throw new Error(`클립이 없습니다: ${titleNo}`);
  return row;
}

/** 관리자 수정: 곡·가수·부른 사람을 고치면 확인 상태로 잠그고 무대를 다시 배정한다. */
export async function editClip(db: Db, titleNo: number, v: { songTitle: string; artist: string | null; performers: string[] }): Promise<void> {
  const old = await clipRow(db, titleNo);
  const songId = await findOrCreateSong(db, v.songTitle.trim(), v.artist?.trim() || null);
  const performers = [...new Set(v.performers.map((p) => p.trim()).filter(Boolean))];
  await db.update(clips).set({
    songId, performers, isDuet: performers.length > 1, status: "confirmed", locked: true, performanceId: null,
  }).where(eq(clips.titleNo, titleNo));
  await assignPerformance(db, titleNo);
  if (old.performanceId) await refreshPerformance(db, old.performanceId);
}

/** 여러 클립을 한 번에 승인(공개) 또는 노래 아님으로. 곡이 없는 클립은 승인할 수 없어 건너뛴다. */
export async function setStatus(db: Db, titleNos: number[], status: "confirmed" | "not_song"): Promise<number> {
  if (titleNos.length === 0) return 0;
  const rows = await db.select().from(clips).where(inArray(clips.titleNo, titleNos));
  const target = status === "confirmed" ? rows.filter((r) => r.songId !== null) : rows;
  if (target.length === 0) return 0;
  await db.update(clips).set(status === "not_song"
    ? { status, locked: true, songId: null, performanceId: null, performers: [], isDuet: false }
    : { status, locked: true }).where(inArray(clips.titleNo, target.map((r) => r.titleNo)));
  const touched = new Set<number>();
  for (const r of target) {
    if (status === "confirmed" && r.performanceId === null) touched.add(await assignPerformance(db, r.titleNo));
    else if (r.performanceId) touched.add(r.performanceId);
  }
  for (const id of touched) await refreshPerformance(db, id);
  return target.length;
}

/** 같은 정규화 곡명을 가진 다른 클립들 */
export async function sameSongCandidates(db: Db, titleNo: number): Promise<number[]> {
  const c = await clipRow(db, titleNo);
  if (!c.songId) return [];
  const [song] = await db.select().from(songs).where(eq(songs.id, c.songId));
  const rows = await db.select({ no: clips.titleNo }).from(clips).innerJoin(songs, eq(songs.id, clips.songId))
    .where(and(eq(songs.titleNorm, song.titleNorm), ne(clips.titleNo, titleNo)));
  return rows.map((r) => r.no);
}

/** 같은 정규화 곡명의 곡들에 원곡 가수를 적용하고 하나로 합친다. 영향받은 클립 수를 돌려준다. */
export async function applyArtistToSameSong(db: Db, titleNo: number, artist: string): Promise<number> {
  const c = await clipRow(db, titleNo);
  if (!c.songId) return 0;
  const [song] = await db.select().from(songs).where(eq(songs.id, c.songId));
  const group = await db.select().from(songs).where(eq(songs.titleNorm, song.titleNorm)).orderBy(asc(songs.id));
  const keep = group[0].id;
  await db.update(songs).set({ originalArtist: artist.trim(), artistNorm: norm(artist) }).where(eq(songs.id, keep));
  for (const g of group.slice(1)) await mergeSongs(db, keep, g.id);
  const [{ n }] = await db.select({ n: count() }).from(clips).where(eq(clips.songId, keep));
  return n;
}

/** 중복 곡 합치기: drop의 클립·무대를 keep으로 옮기고, 3시간 안에 겹치는 무대는 하나로 합친다. */
export async function mergeSongs(db: Db, keepId: number, dropId: number): Promise<void> {
  if (keepId === dropId) return;
  await db.update(clips).set({ songId: keepId }).where(eq(clips.songId, dropId));
  await db.update(performances).set({ songId: keepId }).where(eq(performances.songId, dropId));
  await db.delete(songs).where(eq(songs.id, dropId));
  const list = await db.select().from(performances).where(eq(performances.songId, keepId)).orderBy(asc(performances.startedAt));
  let prev = list[0];
  for (const p of list.slice(1)) {
    if (prev && p.startedAt.getTime() - prev.startedAt.getTime() <= STAGE_WINDOW_MS) {
      await mergePerformances(db, prev.id, p.id);
    } else {
      prev = p;
    }
  }
}

/** 무대 합치기: drop의 클립을 keep으로 옮기고 drop을 지운다. */
export async function mergePerformances(db: Db, keepId: number, dropId: number): Promise<void> {
  if (keepId === dropId) return;
  await db.update(clips).set({ performanceId: keepId }).where(eq(clips.performanceId, dropId));
  await db.delete(performances).where(eq(performances.id, dropId));
  await db.update(performances).set({ locked: true }).where(eq(performances.id, keepId));
  await refreshPerformance(db, keepId);
}

/** 무대 나누기: 고른 클립들로 새 무대를 만든다. */
export async function splitPerformance(db: Db, performanceId: number, titleNos: number[]): Promise<number> {
  const [p] = await db.select().from(performances).where(eq(performances.id, performanceId));
  if (!p) throw new Error(`무대가 없습니다: ${performanceId}`);
  const moving = await db.select().from(clips).where(and(eq(clips.performanceId, performanceId), inArray(clips.titleNo, titleNos)));
  if (moving.length === 0) throw new Error("옮길 클립이 없습니다");
  const [created] = await db.insert(performances).values({
    songId: p.songId, startedAt: new Date(Math.min(...moving.map((m) => m.regDate.getTime()))), locked: true,
  }).returning({ id: performances.id });
  await db.update(clips).set({ performanceId: created.id }).where(inArray(clips.titleNo, moving.map((m) => m.titleNo)));
  await db.update(performances).set({ locked: true }).where(eq(performances.id, performanceId));
  await refreshPerformance(db, performanceId);
  await refreshPerformance(db, created.id);
  return created.id;
}

export type AdminTab = "review" | "noArtist" | "public" | "notSong";

function tabWhere(tab: AdminTab): SQL | undefined {
  const pub = inArray(clips.status, [...PUBLIC_STATUSES]);
  switch (tab) {
    case "review": return eq(clips.status, "review");
    case "noArtist": return and(pub, isNotNull(clips.songId), isNull(songs.originalArtist));
    case "public": return pub;
    case "notSong": return eq(clips.status, "not_song");
  }
}

export async function adminCounts(db: Db): Promise<Record<AdminTab, number>> {
  const n = async (tab: AdminTab) => (await db.select({ n: count() }).from(clips)
    .leftJoin(songs, eq(songs.id, clips.songId)).where(tabWhere(tab)))[0].n;
  return { review: await n("review"), noArtist: await n("noArtist"), public: await n("public"), notSong: await n("notSong") };
}

export async function adminList(db: Db, tab: AdminTab, q: string, page: number) {
  const where = and(tabWhere(tab), q.trim()
    ? or(ilike(clips.titleRaw, `%${q.trim()}%`), ilike(songs.title, `%${q.trim()}%`)) : undefined);
  const rows = await db.select({
    titleNo: clips.titleNo, titleRaw: clips.titleRaw, regDate: clips.regDate, readCnt: clips.readCnt, status: clips.status,
    locked: clips.locked, performers: clips.performers, performanceId: clips.performanceId,
    songId: songs.id, songTitle: songs.title, songSlug: songs.slug, artist: songs.originalArtist,
  }).from(clips).leftJoin(songs, eq(songs.id, clips.songId)).where(where)
    .orderBy(desc(clips.regDate)).limit(ADMIN_PAGE_SIZE).offset((Math.max(1, page) - 1) * ADMIN_PAGE_SIZE);
  const [{ n }] = await db.select({ n: count() }).from(clips).leftJoin(songs, eq(songs.id, clips.songId)).where(where);
  return { rows, total: n };
}
