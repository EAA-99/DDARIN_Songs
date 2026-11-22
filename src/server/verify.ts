import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { clips, performances, songs, titleChecks } from "@/db/schema";
import type { SongLookup } from "@/lib/deezer";
import { norm } from "@/lib/normalize";
import { isNumberTitle, parseTitle, type Parsed } from "@/lib/parse-title";
import { PUBLIC_STATUSES, refreshPerformance } from "./catalog";
import { loadPartners } from "./ingest";

const RECHECK_NOT_FOUND_MS = 30 * 86400_000;

/** 곡명 음원 확인(캐시). 오류면 "error"이고 저장하지 않는다. 못 찾은 결과는 30일 지나면 다시 묻는다 */
export async function lookupCached(
  db: Db, title: string, lookup: SongLookup, now: Date,
): Promise<{ found: boolean; artist: string | null } | "error"> {
  const k = norm(title);
  const [row] = await db.select().from(titleChecks).where(eq(titleChecks.titleNorm, k));
  if (row && (row.found || now.getTime() - row.checkedAt.getTime() < RECHECK_NOT_FOUND_MS)) {
    return { found: row.found, artist: row.artist };
  }
  let r: { found: boolean; artist: string | null };
  try {
    r = await lookup(title);
  } catch {
    return "error";
  }
  await db.insert(titleChecks).values({ titleNorm: k, found: r.found, artist: r.artist, checkedAt: now })
    .onConflictDoUpdate({ target: titleChecks.titleNorm, set: { found: r.found, artist: r.artist, checkedAt: now } });
  return r;
}

/**
 * 자동 공개 조건(스펙 2026-11-22): 제목 읽기가 auto인 클립은 ① 가수가 확실 ② 아는 곡 ③ 음원에 같은 곡명
 * 중 하나여야 공개. 숫자 곡명(1~2자리)은 항상 확인 필요. 원곡 가수는 제목 것이 우선, 없으면 음원 결과.
 */
export async function decide(
  db: Db, p: Parsed, known: ReadonlySet<string>, lookup: SongLookup, now: Date,
): Promise<{ status: Parsed["status"]; artist: string | null; unverified: boolean }> {
  const keep = { status: p.status, artist: p.originalArtist, unverified: false };
  if (p.status !== "auto" || !p.songTitle) return keep;
  if (isNumberTitle(p.songTitle)) return { ...keep, status: "review" };
  if (p.artistSure || known.has(norm(p.songTitle))) return keep;
  const r = await lookupCached(db, p.songTitle, lookup, now);
  if (r === "error") return { ...keep, status: "review", unverified: true };
  return r.found ? { ...keep, artist: p.originalArtist ?? r.artist } : { ...keep, status: "review" };
}

/**
 * 다시 검사에서 "아는 곡": 관리자가 승인한 클립이 있거나 공개 무대가 2개 이상인 곡.
 * (공개 무대 하나뿐이면 그 클립 자신일 수 있어 근거가 되지 않는다)
 */
async function loadTrustedSongs(db: Db): Promise<Set<string>> {
  const rows = await db.select({ t: songs.titleNorm }).from(songs)
    .innerJoin(clips, and(eq(clips.songId, songs.id), inArray(clips.status, [...PUBLIC_STATUSES])))
    .innerJoin(performances, eq(performances.id, clips.performanceId))
    .groupBy(songs.id)
    .having(sql`bool_or(${clips.status} = 'confirmed') or count(distinct ${performances.id}) >= 2`);
  return new Set(rows.map((r) => r.t));
}

/**
 * 다시 검사(스펙 2026-11-22 5장). 잠긴 클립은 건드리지 않는다. 곡 이름·가수는 바꾸지 않는다.
 * - "auto": 자동 공개 클립(방송 단위로 공개한 것 제외)을 새 규칙으로. 통과 못 하면 review, 노래 아님이면 not_song
 * - "unverified": 음원 확인 오류로 보류한 클립. 이번에 통과하면 auto
 */
export async function recheckClips(
  db: Db, which: "auto" | "unverified", lookup: SongLookup, now: Date,
): Promise<{ checked: number; demoted: number; promoted: number; notSong: number }> {
  const rows = await db.select().from(clips).where(and(eq(clips.locked, false), which === "auto"
    ? and(eq(clips.status, "auto"), eq(clips.viaBroadcast, false))
    : and(eq(clips.status, "review"), eq(clips.unverified, true))));
  const out = { checked: rows.length, demoted: 0, promoted: 0, notSong: 0 };
  if (rows.length === 0) return out;
  const [partners, known] = await Promise.all([loadPartners(db), loadTrustedSongs(db)]);
  const touched = new Set<number>();
  for (const c of rows) {
    const p = parseTitle(c.titleRaw, partners);
    const d = p.status === "not_song" ? null : await decide(db, p, known, lookup, now);
    if (which === "auto") {
      if (!d) {
        await db.update(clips).set({ status: "not_song" }).where(eq(clips.titleNo, c.titleNo));
        out.notSong++;
      } else if (d.status !== "auto") {
        await db.update(clips).set({ status: "review", unverified: d.unverified }).where(eq(clips.titleNo, c.titleNo));
        out.demoted++;
      } else continue;
    } else {
      if (d?.unverified) continue; // 또 오류: 다음에 다시
      const ok = d?.status === "auto";
      await db.update(clips).set(ok ? { status: "auto", unverified: false } : { unverified: false })
        .where(eq(clips.titleNo, c.titleNo));
      if (!ok) continue;
      out.promoted++;
    }
    if (c.performanceId) touched.add(c.performanceId);
  }
  for (const id of touched) await refreshPerformance(db, id);
  return out;
}
