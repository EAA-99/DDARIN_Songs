import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { artistPage, songPage, topSongs, topViews } from "./queries";

/** 공개 화면용 캐시(데이터는 하루 한 번 바뀐다). 수집·관리자 변경 뒤 "catalog" 태그를 비운다. */
export const CATALOG_TAG = "catalog";

export async function cachedRankings() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const db = getDb();
  const now = new Date();
  const [week, month, all, songs] = await Promise.all([
    topViews(db, "week", now), topViews(db, "month", now), topViews(db, "all", now), topSongs(db),
  ]);
  return { week, month, all, songs };
}

export async function cachedSongPage(slug: string, sort: "latest" | "views") {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return songPage(getDb(), slug, sort);
}

export async function cachedArtistPage(name: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return artistPage(getDb(), name);
}
