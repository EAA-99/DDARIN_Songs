const KST_MS = 9 * 3600_000;

/** SOOP 시각 "YYYY-MM-DD HH:mm:ss"(KST) → Date */
export function parseKst(s: string): Date {
  const d = new Date(`${s.replace(" ", "T")}+09:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`잘못된 시각: ${s}`);
  return d;
}

/** KST 기준 달력 날짜 "YYYY-MM-DD" */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** 이번 주 월요일 00:00 KST */
export function kstWeekStart(now: Date): Date {
  const k = new Date(now.getTime() + KST_MS);
  const back = (k.getUTCDay() + 6) % 7; // 월=0 … 일=6
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - back) - KST_MS);
}

/** 이번 달 1일 00:00 KST */
export function kstMonthStart(now: Date): Date {
  const k = new Date(now.getTime() + KST_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST_MS);
}
