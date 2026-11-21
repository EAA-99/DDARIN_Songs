// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Player } from "@/components/Player";
import { PlayerProvider, usePlayer } from "@/components/PlayerProvider";
import { embedUrl, soopUrl } from "@/lib/links";

afterEach(cleanup);

test("embed and SOOP urls", () => {
  expect(embedUrl(212858915)).toBe("https://vod.sooplive.com/player/212858915/embed");
  expect(soopUrl(212858915)).toBe("https://vod.sooplive.com/player/212858915");
});

let play: ReturnType<typeof usePlayer>["play"];
function Grab() { play = usePlayer().play; return null; }

test("play() loads the clip in the iframe and links to SOOP", () => {
  const { container } = render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  // 재생 전에는 자리를 차지하지 않는다
  expect(container.innerHTML).toBe("");

  act(() => play(111, "Memories · 윤미래"));
  const frame = screen.getByTitle(/SOOP 플레이어/) as HTMLIFrameElement;
  // fromApi=1이어야 SOOP 플레이어가 재생 상태를 알려 주고 재생/일시정지 명령을 받는다
  expect(frame.src).toBe(`${embedUrl(111)}?fromApi=1`);
  expect((screen.getByRole("link", { name: /SOOP에서 보기/ }) as HTMLAnchorElement).href).toBe(soopUrl(111));
  expect(screen.getByText("Memories · 윤미래")).toBeTruthy();

  act(() => play(222, "Feel Good"));
  expect((screen.getByTitle(/SOOP 플레이어/) as HTMLIFrameElement).src).toBe(`${embedUrl(222)}?fromApi=1`);
  expect((screen.getByRole("link", { name: /SOOP에서 보기/ }) as HTMLAnchorElement).href).toBe(soopUrl(222));
});

test("the 바 mode shows prev/play/next controls, keeps the same iframe, and is remembered", () => {
  localStorage.clear();
  document.elementFromPoint = () => null; // jsdom에는 없다 (모양을 바꿀 때 목록 자리를 지키는 데 쓴다)
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  const frame = screen.getByTitle(/SOOP 플레이어/);
  expect(screen.queryByRole("button", { name: "다음 곡" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "바" }));
  expect(screen.getByRole("button", { name: "이전 곡" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "재생" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "다음 곡" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /SOOP에서 보기/ })).toBeNull();
  // 모양만 바뀌고 iframe은 그대로라 재생이 끊기지 않는다
  expect(screen.getByTitle(/SOOP 플레이어/)).toBe(frame);
  expect(localStorage.getItem("ttarin-songs:player-mode")).toBe("bar");

  fireEvent.click(screen.getByRole("button", { name: "영상" }));
  expect(screen.getByRole("link", { name: /SOOP에서 보기/ })).toBeTruthy();
});

test("the close button hides the player", () => {
  const { container } = render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  fireEvent.click(screen.getByRole("button", { name: "플레이어 닫기" }));
  expect(container.innerHTML).toBe("");
});
