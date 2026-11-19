import { z } from "zod";
import { parseKst } from "./kst";

const BASE = "https://api-channel.sooplive.com/v1.3/channel/insome0319/vod/clip";

export type SoopClip = {
  titleNo: number;
  title: string;
  uploaderNick: string;
  uploaderId: string;
  regDate: Date;
  readCnt: number;
  thumbUrl: string;
  durationMs: number;
};

export type PageQuery = {
  page: number;
  orderBy: "reg_date" | "read_cnt";
  startDate?: string;
  endDate?: string;
};

export type ClipPage = { clips: SoopClip[]; totalPages: number; totalItems: number };

export class SoopFormatError extends Error {}
export class SoopHttpError extends Error {
  constructor(public status: number) { super(`SOOP 응답 오류 ${status}`); }
}

const Item = z.object({
  titleNo: z.number(),
  titleName: z.string(),
  userNick: z.string(),
  userId: z.string(),
  regDate: z.string(),
  count: z.object({ readCnt: z.number() }),
  ucc: z.object({ thumb: z.string(), totalFileDuration: z.number(), fileType: z.string() }),
});
const Page = z.object({
  contents: z.array(Item),
  meta: z.object({ totalItems: z.number(), totalPages: z.number() }),
});

/** SOOP 채널 클립 목록 한 쪽. 형식이 예상과 다르면 SoopFormatError(아무것도 돌려주지 않음). */
export async function fetchClipPage(q: PageQuery, f: typeof fetch = fetch): Promise<ClipPage> {
  const params = new URLSearchParams({
    startDate: q.startDate ?? "", endDate: q.endDate ?? "", keyword: "",
    orderBy: q.orderBy, perPage: "60", page: String(q.page), field: "title,contents,user_nick,user_id",
  });
  const res = await f(`${BASE}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (ttarin-songs)" }, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new SoopHttpError(res.status);
  const parsed = Page.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new SoopFormatError(parsed.error.message);
  const items = parsed.data.contents;
  if (items.length > 0 && !items.some((c) => c.ucc.fileType === "CLIP")) {
    throw new SoopFormatError(`클립이 아닌 항목만 왔습니다(fileType: ${items[0].ucc.fileType})`);
  }
  return {
    totalPages: parsed.data.meta.totalPages,
    totalItems: parsed.data.meta.totalItems,
    clips: parsed.data.contents.filter((c) => c.ucc.fileType === "CLIP").map((c) => ({
      titleNo: c.titleNo,
      title: c.titleName,
      uploaderNick: c.userNick,
      uploaderId: c.userId,
      regDate: parseKst(c.regDate),
      readCnt: c.count.readCnt,
      thumbUrl: c.ucc.thumb.startsWith("//") ? `https:${c.ucc.thumb}` : c.ucc.thumb,
      durationMs: c.ucc.totalFileDuration,
    })),
  };
}

export type ClipDetail = { sourceBj: string | null; sourceVod: number | null; seekSec: number | null };

const Detail = z.object({
  result: z.number(),
  data: z.object({
    copyright_id: z.string().nullish(),
    original_vod: z.coerce.number().nullish(),
    clip_seek_time: z.coerce.number().nullish(),
  }),
});

/** 클립 상세: 어느 방송(copyright_id)의 어느 다시보기(original_vod) 몇 초 지점(clip_seek_time)에서 땄는지 */
export async function fetchClipDetail(titleNo: number, f: typeof fetch = fetch): Promise<ClipDetail> {
  const res = await f("https://api.m.sooplive.com/station/video/a/view", {
    method: "POST",
    headers: { "User-Agent": "Mozilla/5.0 (ttarin-songs)", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nTitleNo: String(titleNo), nApiLevel: "10", nPlaylistIdx: "" }).toString(),
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new SoopHttpError(res.status);
  const parsed = Detail.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new SoopFormatError(parsed.error.message);
  const d = parsed.data.data;
  return { sourceBj: d.copyright_id ?? null, sourceVod: d.original_vod || null, seekSec: d.clip_seek_time ?? null };
}

/** 동시 실행 수와 시작 간격을 제한한다(SOOP에 요청을 몰아 보내지 않기). */
export class Throttle {
  private active = 0;
  private lastStart = 0;
  private queue: (() => void)[] = [];

  constructor(private concurrency = 2, private gapMs = 300) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active >= this.concurrency) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    const target = Math.max(Date.now(), this.lastStart + this.gapMs);
    this.lastStart = target;
    // 타이머가 몇 ms 일찍 깨어날 수 있어 목표 시각이 지날 때까지 다시 기다린다
    for (let wait = target - Date.now(); wait > 0; wait = target - Date.now()) {
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
