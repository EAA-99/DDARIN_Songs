import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "./auth";

/** 관리자 페이지와 모든 관리자 서버 액션의 첫 줄. 로그인하지 않았으면 로그인 화면으로. */
export async function requireAdmin(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token, new Date())) redirect("/admin/login");
}
