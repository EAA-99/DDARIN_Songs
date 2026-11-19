import { expect, test } from "vitest";
import fixture from "./fixtures/soop-page.json";
import { fetchClipPage, SoopFormatError, SoopHttpError, Throttle } from "@/lib/soop";

const clone = () => JSON.parse(JSON.stringify(fixture));
const fakeFetch = (body: unknown, status = 200, seen?: string[]) =>
  (async (url: string | URL) => {
    seen?.push(String(url));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;

test("parses a real page and builds the query", async () => {
  const seen: string[] = [];
  const r = await fetchClipPage(
    { page: 2, orderBy: "read_cnt", startDate: "2026-11-01", endDate: "2026-11-10" },
    fakeFetch(fixture, 200, seen));
  expect(r.clips).toHaveLength(60);
  expect(r.totalPages).toBe(5);
  expect(r.totalItems).toBe(282);
  const c = r.clips[0];
  expect(c.titleNo).toBe(212270053);
  expect(c.regDate.toISOString()).toBe("2026-11-10T14:55:53.000Z");
  expect(c.readCnt).toBe(1152);
  expect(c.durationMs).toBe(75009);
  expect(c.thumbUrl).toMatch(/^https:\/\//);
  const u = new URL(seen[0]);
  expect(u.pathname).toBe("/v1.3/channel/insome0319/vod/clip");
  expect(Object.fromEntries(u.searchParams)).toMatchObject({
    page: "2", orderBy: "read_cnt", perPage: "60", startDate: "2026-11-01", endDate: "2026-11-10",
  });
});

test("missing field is a format error", async () => {
  const bad = clone();
  delete bad.contents[0].count;
  await expect(fetchClipPage({ page: 1, orderBy: "reg_date" }, fakeFetch(bad))).rejects.toBeInstanceOf(SoopFormatError);
});

test("http error status", async () => {
  await expect(fetchClipPage({ page: 1, orderBy: "reg_date" }, fakeFetch({}, 503))).rejects.toBeInstanceOf(SoopHttpError);
});

test("non-clip items are skipped", async () => {
  const body = clone();
  body.contents[0].ucc.fileType = "REVIEW";
  const r = await fetchClipPage({ page: 1, orderBy: "reg_date" }, fakeFetch(body));
  expect(r.clips).toHaveLength(59);
});

test("protocol-relative thumbnails get https", async () => {
  const body = clone();
  body.contents[0].ucc.thumb = "//videoimg.sooplive.com/x.jpg";
  const r = await fetchClipPage({ page: 1, orderBy: "reg_date" }, fakeFetch(body));
  expect(r.clips[0].thumbUrl).toBe("https://videoimg.sooplive.com/x.jpg");
});

test("throttle limits concurrency and spaces starts", async () => {
  const t = new Throttle(2, 50);
  let running = 0, peak = 0;
  const starts: number[] = [];
  await Promise.all(Array.from({ length: 5 }, () => t.run(async () => {
    starts.push(Date.now());
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 30));
    running--;
  })));
  expect(peak).toBeLessThanOrEqual(2);
  // 시작은 계획상 50ms 간격. 개별 간격은 이벤트 루프 지연으로 흔들리므로 전체 폭으로 확인한다
  expect(starts[4] - starts[0]).toBeGreaterThanOrEqual(4 * 50 - 10);
});

// ── 검토 지적 C1/I4 ────────────────────────────────────────────────
test("items present but none are clips is a format error", async () => {
  const body = clone();
  for (const c of body.contents) c.ucc.fileType = "VOD_CLIP";
  await expect(fetchClipPage({ page: 1, orderBy: "reg_date" }, fakeFetch(body))).rejects.toBeInstanceOf(SoopFormatError);
});

test("requests carry a timeout signal", async () => {
  let init: RequestInit | undefined;
  const f = (async (_u: string | URL, i?: RequestInit) => { init = i; return new Response(JSON.stringify(fixture)); }) as typeof fetch;
  await fetchClipPage({ page: 1, orderBy: "reg_date" }, f);
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});
