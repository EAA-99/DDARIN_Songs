import { expect, test } from "vitest";
import { kstDate, kstMonthStart, kstWeekStart, parseKst } from "@/lib/kst";

test("parseKst reads SOOP time as KST", () => {
  expect(parseKst("2026-11-17 01:08:50").toISOString()).toBe("2026-11-16T16:08:50.000Z");
});

test("week starts Monday 00:00 KST, month on the 1st", () => {
  const now = parseKst("2026-11-19 10:00:00"); // 목요일
  expect(kstWeekStart(now).toISOString()).toBe(parseKst("2026-11-16 00:00:00").toISOString());
  expect(kstMonthStart(now).toISOString()).toBe(parseKst("2026-11-01 00:00:00").toISOString());
  // 월요일 새벽 1시(KST)는 그날이 주 시작
  expect(kstWeekStart(parseKst("2026-11-16 01:00:00")).toISOString()).toBe(parseKst("2026-11-16 00:00:00").toISOString());
});

test("kstDate formats the KST calendar day", () => {
  expect(kstDate(new Date("2026-11-18T16:30:00Z"))).toBe("2026-11-19");
});
