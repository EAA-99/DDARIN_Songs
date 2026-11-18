"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { canAttempt, checkPassword, recordAttempt, SESSION_COOKIE, SESSION_MAX_AGE_SEC, signSession } from "@/server/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const db = getDb();
  const now = new Date();
  if (!(await canAttempt(db, now))) return { error: "시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요." };
  const ok = checkPassword(String(form.get("password") ?? ""));
  await recordAttempt(db, ok, now);
  if (!ok) return { error: "비밀번호가 맞지 않아요." };
  (await cookies()).set(SESSION_COOKIE, signSession(now), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: SESSION_MAX_AGE_SEC,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
  redirect("/admin/login");
}
