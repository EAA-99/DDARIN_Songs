// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PerformanceList } from "@/components/PerformanceList";
import { PlayerProvider } from "@/components/PlayerProvider";
import type { PerfRow } from "@/server/queries";

afterEach(cleanup);

const row = (id: number): PerfRow => ({
  id, songTitle: `곡${id}`, songSlug: `song-${id}`, artist: null, startedAt: new Date("2026-11-11T10:00:00Z"),
  isDuet: false, performers: ["따린"], clipCount: 1,
  best: { titleNo: id, readCnt: 1, thumbUrl: "", durationMs: 0 },
});

test("list numbers continue from the page's first position", () => {
  const { container } = render(
    <PlayerProvider><PerformanceList rows={[row(1), row(2)]} clipsByStage={new Map()} start={31} /></PlayerProvider>,
  );
  expect((container.querySelector(".stages") as HTMLElement).style.counterReset).toBe("n 30");
});

test("numbering starts at 1 by default", () => {
  const { container } = render(<PlayerProvider><PerformanceList rows={[row(1)]} clipsByStage={new Map()} /></PlayerProvider>);
  expect((container.querySelector(".stages") as HTMLElement).style.counterReset).toBe("n 0");
});
