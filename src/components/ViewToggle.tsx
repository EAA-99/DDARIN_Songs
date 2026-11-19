"use client";

import { useSyncExternalStore } from "react";

type View = "image" | "list";
const KEY = "view";
const EVENT = "viewchange";

/** 고른 보기는 <html data-view>에 둔다. 새로고침 때는 layout의 머리 스크립트가 먼저 되살려 깜빡이지 않는다. */
export const VIEW_INIT_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="list")document.documentElement.dataset.view="list"}catch(e){}`;

const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };
const read = (): View => (document.documentElement.dataset.view === "list" ? "list" : "image");

function setView(v: View) {
  if (v === "list") document.documentElement.dataset.view = "list";
  else delete document.documentElement.dataset.view;
  try { if (v === "list") localStorage.setItem(KEY, "list"); else localStorage.removeItem(KEY); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** 목록을 썸네일 카드로 볼지, 이미지 없이 곡 제목만 늘어놓은 플레이리스트로 볼지 */
export function ViewToggle() {
  const view = useSyncExternalStore(subscribe, read, () => "image" as View);
  return (
    <div className="view-toggle" role="group" aria-label="보기 방식">
      <button type="button" aria-pressed={view === "image"} aria-label="이미지로 보기" title="이미지로 보기" onClick={() => setView("image")}>
        <svg viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" /><rect x="9" y="9" width="5.5" height="5.5" rx="1" /></svg>
      </button>
      <button type="button" aria-pressed={view === "list"} aria-label="목록으로 보기" title="목록으로 보기" onClick={() => setView("list")}>
        <svg viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="2.5" width="13" height="2" rx="1" /><rect x="1.5" y="7" width="13" height="2" rx="1" /><rect x="1.5" y="11.5" width="13" height="2" rx="1" /></svg>
      </button>
    </div>
  );
}
