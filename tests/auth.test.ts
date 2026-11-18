import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/db";
import { canAttempt, checkPassword, recordAttempt, signSession, verifySession } from "@/server/auth";
import { createTestDb } from "./helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  process.env.ADMIN_PASSWORD = "따린팬123";
  process.env.SESSION_SECRET = "x".repeat(32);
});

const t0 = new Date("2026-11-19T00:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

test("password check", () => {
  expect(checkPassword("따린팬123")).toBe(true);
  expect(checkPassword("따린팬12")).toBe(false);
  expect(checkPassword("")).toBe(false);
});

test("empty ADMIN_PASSWORD never matches", () => {
  process.env.ADMIN_PASSWORD = "";
  expect(checkPassword("")).toBe(false);
});

test("signed session: valid, tampered, expired", () => {
  const token = signSession(t0);
  expect(verifySession(token, later(6 * 86400_000))).toBe(true);
  expect(verifySession(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"), t0)).toBe(false);
  expect(verifySession(`${Number(token.split(".")[0]) + 999999}.${token.split(".")[1]}`, t0)).toBe(false);
  expect(verifySession(token, later(8 * 86400_000))).toBe(false);
  expect(verifySession(undefined, t0)).toBe(false);
});

test("a different secret invalidates sessions", () => {
  const token = signSession(t0);
  process.env.SESSION_SECRET = "y".repeat(32);
  expect(verifySession(token, t0)).toBe(false);
});

test("5 failures in 15 minutes lock login until the window passes", async () => {
  for (let i = 0; i < 5; i++) await recordAttempt(db, false, later(i * 60_000));
  expect(await canAttempt(db, later(5 * 60_000))).toBe(false);
  expect(await canAttempt(db, later(20 * 60_000))).toBe(true);
});

test("successful attempts do not count", async () => {
  for (let i = 0; i < 6; i++) await recordAttempt(db, true, later(i * 1000));
  expect(await canAttempt(db, later(10_000))).toBe(true);
});
