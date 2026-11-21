"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

type Current = { titleNo: number; label: string; durationMs?: number } | null;
export type PlayerMode = "video" | "bar";
type PlayerCtx = {
  current: Current;
  play: (titleNo: number, label: string, durationMs?: number) => void;
  stop: () => void;
  mode: PlayerMode;
  setMode: (m: PlayerMode) => void;
};

const Ctx = createContext<PlayerCtx | null>(null);
const MODE_KEY = "ttarin-songs:player-mode";

// 플레이어 모양(영상/바)은 기기에 저장해 다음에도 그 모양으로 연다. 저장이 안 되는 브라우저면 이번 방문 동안만 기억한다.
let memMode: PlayerMode = "video";
const modeListeners = new Set<() => void>();
const subscribeMode = (cb: () => void) => {
  modeListeners.add(cb);
  return () => {
    modeListeners.delete(cb);
  };
};
const readMode = (): PlayerMode => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "bar" || v === "video") return v;
  } catch {}
  return memMode;
};
const setMode = (m: PlayerMode) => {
  memMode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
  modeListeners.forEach((cb) => cb());
};

/** 페이지를 옮겨도 재생이 이어지도록 레이아웃에 둔다. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Current>(null);
  const mode = useSyncExternalStore(subscribeMode, readMode, (): PlayerMode => "video");
  const play = useCallback(
    (titleNo: number, label: string, durationMs?: number) => setCurrent({ titleNo, label, durationMs }),
    [],
  );
  const stop = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, play, stop, mode, setMode }), [current, play, stop, mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("PlayerProvider 안에서만 쓸 수 있습니다");
  return v;
}
