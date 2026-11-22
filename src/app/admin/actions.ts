"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getDb } from "@/db";
import { searchDeezer, throttled } from "@/lib/deezer";
import { fetchClipDetail, fetchClipPage } from "@/lib/soop";
import {
  applyArtistToSameSong, editClip, mergePerformances, mergeSongs, sameSongCandidates, setStatus, splitPerformance,
} from "@/server/admin";
import { CATALOG_TAG } from "@/server/cached";
import { requireAdmin } from "@/server/session";
import { runBackfillStep, runDaily } from "@/server/sync";
import { recheckClips } from "@/server/verify";

// 관리자 변경은 공개 캐시를 바로 비워 다음 방문에 반영되게 한다
const done = () => { updateTag(CATALOG_TAG); revalidatePath("/admin"); };
const deps = () => ({ fetchPage: fetchClipPage, fetchDetail: fetchClipDetail, lookupSong: searchDeezer(), now: () => new Date() });

export async function editClipAction(titleNo: number, v: { songTitle: string; artist: string; performers: string }) {
  await requireAdmin();
  const db = getDb();
  await editClip(db, titleNo, { songTitle: v.songTitle, artist: v.artist || null, performers: v.performers.split(/[,，]/) });
  const same = v.artist ? (await sameSongCandidates(db, titleNo)).length : 0;
  done();
  return { sameSongCount: same };
}

export async function setStatusAction(titleNos: number[], status: "confirmed" | "not_song") {
  await requireAdmin();
  const n = await setStatus(getDb(), titleNos, status);
  done();
  return n;
}

export async function applyArtistAction(titleNo: number, artist: string) {
  await requireAdmin();
  const n = await applyArtistToSameSong(getDb(), titleNo, artist);
  done();
  return n;
}

export async function mergeSongsAction(keepId: number, dropId: number) {
  await requireAdmin();
  await mergeSongs(getDb(), keepId, dropId);
  done();
}

export async function mergePerformancesAction(keepId: number, dropId: number) {
  await requireAdmin();
  await mergePerformances(getDb(), keepId, dropId);
  done();
}

export async function splitPerformanceAction(performanceId: number, titleNos: number[]) {
  await requireAdmin();
  const id = await splitPerformance(getDb(), performanceId, titleNos);
  done();
  return id;
}

export async function syncNowAction() {
  await requireAdmin();
  const r = await runDaily(getDb(), deps(), "manual");
  done();
  return r;
}

export async function backfillStepAction() {
  await requireAdmin();
  const r = await runBackfillStep(getDb(), deps());
  done();
  return r;
}

/** 자동 공개 클립을 새 규칙(음원 확인)으로 다시 검사. 잠긴 클립은 그대로 */
export async function recheckAutoAction() {
  await requireAdmin();
  const r = await recheckClips(getDb(), "auto", throttled(searchDeezer()), new Date());
  done();
  return r;
}
