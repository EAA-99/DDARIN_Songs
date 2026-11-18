import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Player } from "@/components/Player";
import { PlayerProvider } from "@/components/PlayerProvider";
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
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <PlayerProvider>
          <header className="hero">
            <div className="wrap hero__inner">
              <div className="hero__top">
                <Link href="/" className="brand">따린 노래 클립</Link>
                <span className="brand__sub">SOOP 시청자 클립에서 모은 따린님의 노래</span>
              </div>
              <Player />
            </div>
          </header>
          <main className="wrap">{children}</main>
          <footer className="footer">
            <div className="wrap">
              팬이 만든 비공식 사이트입니다. 영상과 조회수는 SOOP 시청자 클립에서 가져오며 하루에 한 번 갱신됩니다.
            </div>
          </footer>
        </PlayerProvider>
      </body>
    </html>
  );
}
