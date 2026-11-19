"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { beginAttempt, checkPassword, markAttemptOk, SESSION_COOKIE, SESSION_MAX_AGE_SEC, signSession } from "@/server/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const db = getDb();
  const now = new Date();
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  const attempt = await beginAttempt(db, ip, now);
  if (!attempt.allowed) return { error: "시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요." };
  if (!checkPassword(String(form.get("password") ?? ""))) return { error: "비밀번호가 맞지 않아요." };
  await markAttemptOk(db, attempt.id);
  (await cookies()).set(SESSION_COOKIE, signSession(now), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: SESSION_MAX_AGE_SEC,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
  redirect("/admin/login");
}
