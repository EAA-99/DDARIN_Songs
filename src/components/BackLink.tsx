"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// 이 사이트 안에서 몇 번 옮겨 다녔는지. 1이면 이 페이지로 바로 들어온 것이라 "뒤로"할 곳이 없다.
let visits = 0;
let poppedAt = 0; // 마지막으로 뒤로/앞으로 가기를 한 시각

/** 레이아웃에 둔다. 사이트 안에서 페이지를 옮길 때마다 센다. */
export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => {
    const onPop = () => {
      poppedAt = Date.now();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    visits += 1;
    // 새 페이지는 맨 위에서 시작한다 (위에 붙은 플레이어 뒤로 제목과 "곡 목록" 버튼이 숨지 않게).
    // 뒤로/앞으로 가기는 보던 자리로 돌아가야 하니 그대로 둔다.
    if (visits > 1 && Date.now() - poppedAt > 1000) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** 곡/가수 페이지의 "← 곡 목록". 목록에서 왔으면 뒤로 가서 보던 위치로, 아니면 첫 화면으로. */
export function BackLink() {
  const router = useRouter();
  return (
    <button type="button" className="back-link" onClick={() => (visits > 1 ? router.back() : router.push("/"))}>
      ← 곡 목록
    </button>
  );
}
