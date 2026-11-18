"use client";

import { formatDuration } from "@/lib/links";
import { usePlayer } from "./PlayerProvider";

type Props = { titleNo: number; label: string };

/** 썸네일 자체가 재생 버튼 */
export function ThumbPlay({ titleNo, label, thumbUrl, durationMs }: Props & { thumbUrl: string; durationMs: number }) {
  const { current, play } = usePlayer();
  const on = current?.titleNo === titleNo;
  return (
    <button type="button" className="thumb" aria-pressed={on} aria-label={`${label} 재생`} onClick={() => play(titleNo, label)}>
      {thumbUrl ? (
        // SOOP 썸네일 주소가 여러 호스트라 next/image 대신 img를 쓴다
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : null}
      <span className="thumb__play"><span>{on ? "♪" : "▶"}</span></span>
      {durationMs > 0 && <span className="thumb__dur num">{formatDuration(durationMs)}</span>}
    </button>
  );
}

export function ClipPlay({ titleNo, label }: Props) {
  const { current, play } = usePlayer();
  const on = current?.titleNo === titleNo;
  return (
    <button type="button" className="clip__play" aria-pressed={on} aria-label={`${label} 재생`} onClick={() => play(titleNo, label)}>
      {on ? "♪" : "▶"}
    </button>
  );
}

export function MiniPlay({ titleNo, label }: Props) {
  const { current, play } = usePlayer();
  const on = current?.titleNo === titleNo;
  return (
    <button type="button" className="mini-play" aria-pressed={on} aria-label={`${label} 재생`} onClick={() => play(titleNo, label)}>
      {on ? "♪" : "▶"}
    </button>
  );
}
