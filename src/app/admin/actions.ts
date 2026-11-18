"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { fetchClipPage } from "@/lib/soop";
import {
  applyArtistToSameSong, editClip, mergePerformances, mergeSongs, sameSongCandidates, setStatus, splitPerformance,
} from "@/server/admin";
import { requireAdmin } from "@/server/session";
import { runBackfillStep, runDaily } from "@/server/sync";

const done = () => { revalidatePath("/admin"); revalidatePath("/", "layout"); };
const deps = () => ({ fetchPage: fetchClipPage, now: () => new Date() });

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
