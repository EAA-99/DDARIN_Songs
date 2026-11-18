"use client";

import { embedUrl, soopUrl } from "@/lib/links";
import { usePlayer } from "./PlayerProvider";

/** 헤더에 고정된 SOOP 플레이어. 재생이 막혀도 SOOP 링크로 볼 수 있게 항상 링크를 둔다. */
export function Player() {
  const { current } = usePlayer();
  if (!current) {
    return (
      <div className="player player--empty">
        <span className="player__icon" aria-hidden>▶</span>
        <p>듣고 싶은 무대의 <b>▶</b>를 누르면 여기서 재생돼요</p>
      </div>
    );
  }
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
        <a href={soopUrl(current.titleNo)} target="_blank" rel="noopener noreferrer">SOOP에서 보기 ↗</a>
      </div>
    </div>
  );
}
