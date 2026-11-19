import { and, between, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { clips } from "@/db/schema";
import { collabSignal, looksLikeSongTitle, parseTitle, type Parsed } from "@/lib/parse-title";
import type { ClipDetail, SoopClip } from "@/lib/soop";
import { assignPerformance, findOrCreateSong, guessArtist, PUBLIC_STATUSES, refreshPerformance } from "./catalog";

const ME = "따린";
export const CHANNEL_ID = "insome0319";

export type FetchDetail = (titleNo: number) => Promise<ClipDetail>;

/** 공개 클립에 함께 부른 사람으로 나온 이름들(분류 정확도용) */
export async function loadPartners(db: Db): Promise<Set<string>> {
  const rows = await db.select({ p: clips.performers }).from(clips)
    .where(inArray(clips.status, [...PUBLIC_STATUSES]));
  return new Set(rows.flatMap((r) => r.p).filter((n) => n !== ME));
}

async function songFor(db: Db, p: Parsed): Promise<number | null> {
  if (p.status === "not_song" || !p.songTitle) return null;
  const artist = p.originalArtist ?? (await guessArtist(db, p.songTitle));
  return findOrCreateSong(db, p.songTitle, artist);
}

/**
 * SOOP에서 받은 클립을 DB에 반영한다.
 * 새 클립: 분류 → (노래 후보·합방 신호면) 원본 방송 정보 → 곡 연결 → 무대 배정 → 방송 단위 판단.
 * 기존 클립: 조회수·썸네일만 갱신(관리자 수정값 보존). 사라졌다가(gone) 다시 보이는 클립은 상태를 되돌린다.
 */
export async function ingestClips(
  db: Db, list: SoopClip[], now: Date, knownPartners?: Set<string>, fetchDetail?: FetchDetail,
): Promise<{ inserted: number; updated: number }> {
  if (list.length === 0) return { inserted: 0, updated: 0 };
  const partners = knownPartners ?? (await loadPartners(db));
  const existing = new Map((await db.select().from(clips)
    .where(inArray(clips.titleNo, list.map((c) => c.titleNo)))).map((r) => [r.titleNo, r]));
  const touched = new Set<number>();
  const vods = new Set<number>();
  let inserted = 0, updated = 0;

  for (const s of list) {
    const old = existing.get(s.titleNo);
    if (old) {
      // 상태는 사라졌다 돌아온(gone) 클립만 되돌린다. 그 밖에는 관리자·다른 실행이 바꾼 값을 건드리지 않는다
      await db.update(clips).set({ readCnt: s.readCnt, thumbUrl: s.thumbUrl, viewsUpdatedAt: now })
        .where(eq(clips.titleNo, s.titleNo));
      if (old.status === "gone") {
        const status = old.locked ? (old.songId ? "confirmed" : "not_song") : parseTitle(old.titleRaw, partners).status;
        await db.update(clips).set({ status }).where(and(eq(clips.titleNo, s.titleNo), eq(clips.status, "gone")));
      }
      if (old.performanceId) touched.add(old.performanceId);
      updated++;
      continue;
    }
    const p = parseTitle(s.title, partners);
    const wantDetail = fetchDetail && (p.status !== "not_song" || collabSignal(s.title, partners));
    const detail = wantDetail ? await fetchDetail(s.titleNo) : null;
    const songId = await songFor(db, p);
    await db.insert(clips).values({
      titleNo: s.titleNo, titleRaw: s.title, uploaderNick: s.uploaderNick, uploaderId: s.uploaderId,
      regDate: s.regDate, readCnt: s.readCnt, thumbUrl: s.thumbUrl, durationMs: s.durationMs,
      status: p.status, songId, performers: p.performers, isDuet: p.performers.length > 1,
      sourceBj: detail?.sourceBj ?? null, sourceVod: detail?.sourceVod ?? null, seekSec: detail?.seekSec ?? null,
      firstSeenAt: now, viewsUpdatedAt: now,
    });
    if (songId) await assignPerformance(db, s.titleNo);
    if (detail?.sourceVod) vods.add(detail.sourceVod);
    if (p.status === "auto") p.performers.filter((n) => n !== ME).forEach((n) => partners.add(n));
    inserted++;
  }
  for (const vod of vods) (await resolveBroadcast(db, vod, partners)).forEach((id) => touched.add(id));
  for (const id of touched) await refreshPerformance(db, id);
  return { inserted, updated };
}

/**
 * 방송(원본 다시보기) 단위 판단(스펙 6장 7). 합방 신호가 없으면 그 방송의 "가수 - 곡명" 확인 필요 클립을
 * 따린님 무대로 공개하고, 합방 신호가 생기면 그렇게 공개했던 클립을 확인 필요로 돌린다. 잠긴 클립은 건드리지 않는다.
 * 바뀐 클립의 무대 번호를 돌려준다(호출한 쪽이 다시 계산).
 */
export async function resolveBroadcast(db: Db, vod: number, partners: ReadonlySet<string>): Promise<number[]> {
  const rows = await db.select().from(clips).where(eq(clips.sourceVod, vod));
  // 다른 사람이 따린님 없이 부른 클립(제목 신호, 또는 관리자가 따린님 없이 적은 부른 사람)이 있으면 합방
  const collab = rows.some((r) => collabSignal(r.titleRaw, partners)
    || (r.locked && r.performers.length > 0 && !r.performers.includes(ME)));
  const change = collab
    ? rows.filter((r) => r.viaBroadcast && !r.locked)
    : rows.filter((r) => r.status === "review" && !r.locked && r.sourceBj === CHANNEL_ID && r.songId !== null
      && r.performers.length === 0 && looksLikeSongTitle(r.titleRaw));
  if (change.length === 0) return [];
  await db.update(clips).set(collab
    ? { status: "review", performers: [], isDuet: false, viaBroadcast: false }
    : { status: "auto", performers: [ME], isDuet: false, viaBroadcast: true })
    .where(inArray(clips.titleNo, change.map((r) => r.titleNo)));
  return change.map((r) => r.performanceId).filter((p): p is number => p !== null);
}

export class SuspiciousRefetchError extends Error {}

/**
 * 다시 받은 기간(range)에 없는 클립은 SOOP에서 지워진 것으로 보고 숨긴다. 관리자 수정값은 남긴다.
 * guard: 아무것도 받지 못했거나 한꺼번에 많이(3개 넘게, 20% 넘게) 사라지면 응답을 믿지 않고 오류를 낸다.
 */
export async function markGone(
  db: Db, seenNos: Set<number>, range: { from: Date; to: Date }, opts: { guard?: boolean } = {},
): Promise<number> {
  const rows = await db.select({ no: clips.titleNo, p: clips.performanceId }).from(clips)
    .where(and(between(clips.regDate, range.from, range.to), ne(clips.status, "gone")));
  const missing = rows.filter((r) => !seenNos.has(r.no));
  if (missing.length === 0) return 0;
  if (opts.guard && (seenNos.size === 0 || (missing.length > 3 && missing.length / rows.length > 0.2))) {
    throw new SuspiciousRefetchError(`다시 받은 목록에서 ${rows.length}개 중 ${missing.length}개가 빠졌습니다. 응답을 믿을 수 없어 숨기지 않았습니다.`);
  }
  await db.update(clips).set({ status: "gone" }).where(inArray(clips.titleNo, missing.map((r) => r.no)));
  for (const id of new Set(missing.map((r) => r.p).filter((p): p is number => p !== null))) {
    await refreshPerformance(db, id);
  }
  return missing.length;
}
