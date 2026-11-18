import type { Db } from "@/db";
import { clips } from "@/db/schema";
import { parseKst } from "@/lib/kst";

let next = 1000;

export type ClipInput = Partial<typeof clips.$inferInsert> & { at?: string };

/** 테스트용 클립 한 개를 바로 넣는다. at: "YYYY-MM-DD HH:mm:ss"(KST) */
export async function insertClip(db: Db, v: ClipInput = {}): Promise<number> {
  const titleNo = v.titleNo ?? next++;
  const regDate = v.at ? parseKst(v.at) : (v.regDate ?? parseKst("2026-11-01 12:00:00"));
  await db.insert(clips).values({
    titleNo,
    titleRaw: v.titleRaw ?? `clip ${titleNo}`,
    uploaderNick: v.uploaderNick ?? "viewer",
    uploaderId: v.uploaderId ?? "viewer1",
    regDate,
    readCnt: v.readCnt ?? 0,
    thumbUrl: v.thumbUrl ?? "https://example.com/t.jpg",
    durationMs: v.durationMs ?? 60000,
    status: v.status ?? "auto",
    songId: v.songId ?? null,
    performers: v.performers ?? ["따린"],
    isDuet: v.isDuet ?? (v.performers ?? ["따린"]).length > 1,
    performanceId: v.performanceId ?? null,
    locked: v.locked ?? false,
    firstSeenAt: regDate,
    viewsUpdatedAt: regDate,
  });
  return titleNo;
}
