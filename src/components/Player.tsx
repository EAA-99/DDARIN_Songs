"use client";

import { embedUrl, soopUrl } from "@/lib/links";
import { usePlayer } from "./PlayerProvider";

/** 헤더에 고정된 SOOP 플레이어. 재생 전에는 그리지 않고, 재생이 막혀도 SOOP 링크로 볼 수 있게 항상 링크를 둔다. */
export function Player() {
  const { current, stop } = usePlayer();
  if (!current) return null;
  return (
    <div className="player">
      <div className="player__frame">
        <iframe
          key={current.titleNo}
          src={embedUrl(current.titleNo)}
          title={`SOOP 플레이어: ${current.label}`}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
        />
      </div>
      <div className="player__bar">
        <span className="player__now">
          <span className="player__eq" aria-hidden><i /><i /><i /></span>
          <span>{current.label}</span>
        </span>
        <span className="player__actions">
          <a href={soopUrl(current.titleNo)} target="_blank" rel="noopener noreferrer">SOOP에서 보기 ↗</a>
          <button type="button" onClick={stop} aria-label="플레이어 닫기">✕</button>
        </span>
      </div>
    </div>
  );
}
