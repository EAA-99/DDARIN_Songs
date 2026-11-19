"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Current = { titleNo: number; label: string } | null;
type PlayerCtx = { current: Current; play: (titleNo: number, label: string) => void; stop: () => void };

const Ctx = createContext<PlayerCtx | null>(null);

/** 페이지를 옮겨도 재생이 이어지도록 레이아웃에 둔다. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Current>(null);
  const play = useCallback((titleNo: number, label: string) => setCurrent({ titleNo, label }), []);
  const stop = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, play, stop }), [current, play, stop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): PlayerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("PlayerProvider 안에서만 쓸 수 있습니다");
  return v;
}
