"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="login">
      <h1>관리자</h1>
      <label>
        <span>비밀번호</span>
        <input type="password" name="password" autoComplete="current-password" required autoFocus />
      </label>
      {state.error && <p className="login__error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "확인 중…" : "들어가기"}</button>
    </form>
  );
}
