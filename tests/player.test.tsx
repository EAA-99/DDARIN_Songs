// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

// 제목을 누르면 곡 목록으로 가는 데 쓴다
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, back: vi.fn() }),
}));
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

/** 일정표 앱이 "다른 화면으로 갔다"(dock)고 알려 준 상태로 만든다. jsdom에서는 window.parent === window. */
function dock(on: boolean) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: { type: "ttarin-dock", on }, source: window }));
  });
}

test("docked in the schedule app, the 영상 button turns the bar into the video player in place", () => {
  localStorage.setItem("ttarin-songs:player-mode", "bar");
  document.elementFromPoint = () => null;
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  dock(true);
  expect(screen.getByRole("button", { name: "다음 곡" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "영상" }));
  // 바가 영상 모양으로 바뀐다 (앱 화면은 그대로 = 여전히 dock 상태)
  expect(screen.queryByRole("button", { name: "다음 곡" })).toBeNull();
  expect(screen.getByRole("link", { name: /SOOP에서 보기/ })).toBeTruthy();
  expect(document.documentElement.classList.contains("is-docked")).toBe(true);
  // 다시 바로
  fireEvent.click(screen.getByRole("button", { name: "바" }));
  expect(screen.getByRole("button", { name: "다음 곡" })).toBeTruthy();
  dock(false);
});

test("docked, clicking the title asks the app to open the Playlist screen", () => {
  const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  dock(true);
  fireEvent.click(screen.getByRole("button", { name: "곡 목록으로" }));
  expect(post).toHaveBeenCalledWith({ type: "ttarin-open" }, "*");
  post.mockRestore();
  dock(false);
});

test("on a song page, clicking the title goes to the list", () => {
  window.history.pushState(null, "", "/song/memories");
  nav.push.mockClear();
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  fireEvent.click(screen.getByRole("button", { name: "곡 목록으로" }));
  expect(nav.push).toHaveBeenCalledWith("/");
  window.history.pushState(null, "", "/");
});

test("on the list, clicking the title scrolls to the playing clip", () => {
  nav.push.mockClear();
  const thumb = document.createElement("button");
  thumb.className = "thumb";
  thumb.dataset.titleNo = "111";
  thumb.scrollIntoView = vi.fn();
  document.body.appendChild(thumb);
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  fireEvent.click(screen.getByRole("button", { name: "곡 목록으로" }));
  expect(thumb.scrollIntoView).toHaveBeenCalled();
  expect(nav.push).not.toHaveBeenCalled();
  thumb.remove();
});

test("the close button hides the player", () => {
  const { container } = render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  fireEvent.click(screen.getByRole("button", { name: "플레이어 닫기" }));
  expect(container.innerHTML).toBe("");
});
