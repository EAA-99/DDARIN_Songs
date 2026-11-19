// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
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
  expect(frame.src).toBe(embedUrl(111));
  expect((screen.getByRole("link", { name: /SOOP에서 보기/ }) as HTMLAnchorElement).href).toBe(soopUrl(111));
  expect(screen.getByText("Memories · 윤미래")).toBeTruthy();

  act(() => play(222, "Feel Good"));
  expect((screen.getByTitle(/SOOP 플레이어/) as HTMLIFrameElement).src).toBe(embedUrl(222));
  expect((screen.getByRole("link", { name: /SOOP에서 보기/ }) as HTMLAnchorElement).href).toBe(soopUrl(222));
});

test("the close button hides the player", () => {
  const { container } = render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  fireEvent.click(screen.getByRole("button", { name: "플레이어 닫기" }));
  expect(container.innerHTML).toBe("");
});

test("only the first clip scrolls to the top; later clips keep the scroll position", () => {
  const scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  act(() => play(111, "Memories"));
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  act(() => play(222, "Feel Good"));
  expect(scrollTo).toHaveBeenCalledTimes(1);
});
