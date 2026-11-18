// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
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
  render(<PlayerProvider><Player /><Grab /></PlayerProvider>);
  expect(screen.queryByTitle(/SOOP 플레이어/)).toBeNull();
  expect(screen.getByText(/듣고 싶은 무대/)).toBeTruthy();

  act(() => play(111, "Memories · 윤미래"));
  const frame = screen.getByTitle(/SOOP 플레이어/) as HTMLIFrameElement;
  expect(frame.src).toBe(embedUrl(111));
  expect((screen.getByRole("link", { name: /SOOP에서 보기/ }) as HTMLAnchorElement).href).toBe(soopUrl(111));
  expect(screen.getByText("Memories · 윤미래")).toBeTruthy();

  act(() => play(222, "Feel Good"));
  expect((screen.getByTitle(/SOOP 플레이어/) as HTMLIFrameElement).src).toBe(embedUrl(222));
  expect((screen.getByRole("link", { name: /SOOP에서 보기/ }) as HTMLAnchorElement).href).toBe(soopUrl(222));
});
