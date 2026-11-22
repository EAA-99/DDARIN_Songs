import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NavHistory } from "@/components/BackLink";
import { Player } from "@/components/Player";
import { PlayerProvider } from "@/components/PlayerProvider";
import { VIEW_INIT_SCRIPT } from "@/components/ViewToggle";
import { CHANNEL_URL, PROFILE_IMG } from "@/lib/links";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "따린 노래 클립", template: "%s · 따린 노래 클립" },
  description: "SOOP 따린(insome0319) 방송의 노래 클립을 곡명·가수로 찾아 듣는 팬 사이트",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2f6bff" },
    { media: "(prefers-color-scheme: dark)", color: "#1d4fe0" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: VIEW_INIT_SCRIPT }} />
        {/* 일정표 앱 안(iframe)에서 열리면 앱에 자기 머리말이 있으니 이 사이트의 로고 줄은 숨긴다 */}
        <script dangerouslySetInnerHTML={{ __html: `if(window.top!==window.self)document.documentElement.classList.add("in-app")` }} />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <PlayerProvider>
          <header className="topbar">
            <div className="wrap topbar__inner">
              <Link href="/" className="brand">
                {/* SOOP 프로필 이미지는 외부 호스트라 img를 쓴다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PROFILE_IMG} alt="" width={32} height={32} referrerPolicy="no-referrer" />
                <span>따린 노래 클립</span>
              </Link>
              <a className="topbar__channel" href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">SOOP 방송국 ↗</a>
            </div>
            <div className="wrap"><Player /></div>
            <Suspense fallback={null}><NavHistory /></Suspense>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">
            <div className="wrap">
              팬이 만든 비공식 사이트입니다. 영상과 조회수는 SOOP 시청자 클립에서 가져오며 하루에 한 번 갱신됩니다.
              {/* 일정표 앱 안(iframe)에서는 로그인 쿠키가 막힐 수 있어 항상 새 탭으로 연다 */}
              <a className="footer__admin" href="/admin" target="_blank" rel="noopener">관리자</a>
            </div>
          </footer>
        </PlayerProvider>
      </body>
    </html>
  );
}
