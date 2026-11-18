import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import type { Db } from "@/db";
import { loginAttempts } from "@/db/schema";

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SEC = 7 * 86400;
const LOCK_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** 상수 시간 비교(길이가 달라도 시간 차이로 새지 않게 해시끼리 비교). 비밀번호가 비어 있으면 항상 거부. */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected));
}

function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET은 32자 이상이어야 합니다");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** 만료 시각(ms).서명 */
export function signSession(now: Date): string {
  const exp = String(now.getTime() + SESSION_MAX_AGE_SEC * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifySession(token: string | undefined, now: Date): boolean {
  if (!token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(exp));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > now.getTime();
}

/** 최근 15분 안에 실패가 5번 이상이면 잠시 막는다. */
export async function canAttempt(db: Db, now: Date): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(loginAttempts).where(and(
    eq(loginAttempts.ok, false), gte(loginAttempts.at, new Date(now.getTime() - LOCK_WINDOW_MS))));
  return n < MAX_FAILURES;
}

export async function recordAttempt(db: Db, ok: boolean, now: Date): Promise<void> {
  await db.insert(loginAttempts).values({ at: now, ok });
}
