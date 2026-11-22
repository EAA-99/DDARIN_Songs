import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SESSION_COOKIE, verifySession } from "@/server/auth";
import { LoginForm } from "./LoginForm";

/** 이미 로그인돼 있으면 비밀번호를 다시 묻지 않고 관리자 화면으로 */
async function SkipIfSignedIn() {
  if (verifySession((await cookies()).get(SESSION_COOKIE)?.value, new Date())) redirect("/admin");
  return null;
}

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}><SkipIfSignedIn /></Suspense>
      <LoginForm />
    </>
  );
}
