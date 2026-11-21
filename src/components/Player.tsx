"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { embedUrl, formatDuration, soopUrl } from "@/lib/links";
import { usePlayer, type PlayerMode } from "./PlayerProvider";

/**
 * SOOP 플레이어. "영상"은 상단에 영상을 보여 주고, "바"는 영상을 숨긴 채 화면 아래 한 줄 바로 조종한다.
 * 두 모드는 같은 iframe을 쓰고 모양만 바꾸므로, 재생 중에 바꿔도 끊기지 않는다.
 * 조종은 SOOP 임베드 API(?fromApi=1 + postMessage: PonReady → Pload, Pplay/Ppause, PupdateMediaEvent)로 한다.
 */
export function Player() {
  const { current, play, stop, mode, setMode } = usePlayer();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // 재생 상태는 어느 클립의 것인지 함께 둔다 (클립이 바뀌면 따로 비우지 않아도 처음 상태로 보인다)
  const [media, setMedia] = useState({ titleNo: 0, playing: false, time: 0 });
  const lastClick = useRef<{ el: Element; top: number; at: number } | null>(null);
  const titleNo = current?.titleNo;

  // 재생 버튼을 누른 순간 그 버튼의 화면 위치를 기억해 둔다 (아래 자리 지키기에 씀)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("button") : null;
      lastClick.current = el ? { el, top: el.getBoundingClientRect().top, at: Date.now() } : null;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 클립을 누르면 누른 버튼 자리를 지킨다 (SOOP 플레이어가 뜨면서 페이지를 맨 위로 올려 버리는 경우가 있음)
  useEffect(() => {
    if (!titleNo) return;
    const c = lastClick.current;
    lastClick.current = null;
    return keepPlace(c && c.el.isConnected && Date.now() - c.at < 1000 ? c : null);
  }, [titleNo]);

  // 일정표 앱 안에 들어가 있을 때: 앱이 다른 화면으로 가면 "dock"을 보내고, 이 페이지는 바만 남긴다.
  // 재생 중인지는 앱에 알려 준다 (재생 중일 때만 앱이 아래에 바를 남겨 둔다).
  const [docked, setDocked] = useState(false);
  const savedY = useRef(0);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== "ttarin-dock") return;
      setDocked(!!e.data.on);
    };
    // 돌아왔을 때 되돌릴 목록 위치. "dock"이 올 땐 이미 창이 줄어 위치가 바뀌어 있어서, 평소에 계속 기억해 둔다
    const onScroll = () => {
      if (window.innerHeight > 150 && !document.documentElement.classList.contains("is-docked")) savedY.current = window.scrollY;
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  // 바만 남기기/되돌리기는 플레이어 모양이 바뀐 직후(그려지기 전)에 해야 목록 위치를 정확히 되돌릴 수 있다
  useLayoutEffect(() => {
    const html = document.documentElement;
    if (html.classList.contains("is-docked") === docked) return;
    html.classList.toggle("is-docked", docked);
    if (docked) return;
    // 앱이 이 창(iframe)을 다시 키우는 동안(열리는 애니메이션) 크기가 여러 번 바뀌어서, 1초 동안은 바뀔 때마다 맞춘다
    const y = savedY.current;
    const go = () => window.scrollTo(0, y);
    go();
    window.addEventListener("resize", go);
    const stop = () => {
      window.removeEventListener("resize", go);
      for (const t of ["wheel", "touchstart", "keydown"]) window.removeEventListener(t, stop, true);
    };
    for (const t of ["wheel", "touchstart", "keydown"]) window.addEventListener(t, stop, true);
    setTimeout(stop, 1000);
  }, [docked]);
  const active = !!current;
  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: "ttarin-player", active }, "*");
  }, [active]);

  useEffect(() => {
    if (!titleNo) return;
    const update = (patch: Partial<typeof media>) =>
      setMedia((m) => ({ ...(m.titleNo === titleNo ? m : { titleNo, playing: false, time: 0 }), ...patch }));
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const d = e.data;
      if (d?.cmd === "PonReady") win.postMessage({ cmd: "Pload", id: titleNo, autoPlay: true, showChat: false }, "*");
      if (d?.cmd === "PupdateMediaEvent") {
        const ev = d.event ?? {};
        if (ev.type === "play") update({ playing: true });
        if (ev.type === "pause" || ev.type === "end") update({ playing: false });
        if (ev.type === "timeUpdate" && typeof ev.currentTime === "number") update({ time: ev.currentTime });
        if (ev.type === "end") {
          // 곡이 끝나면 목록의 다음 곡
          const next = neighborThumb(titleNo, 1);
          if (next) play(...thumbClip(next));
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [titleNo, play]);

  if (!current) return null;
  const playing = media.titleNo === current.titleNo && media.playing;
  const time = media.titleNo === current.titleNo ? media.time : 0;
  const send = (cmd: string) => frameRef.current?.contentWindow?.postMessage({ cmd }, "*");
  const total = current.durationMs ? current.durationMs / 1000 : 0;
  const isBar = mode === "bar" || docked;
  // 모양을 바꿀 때 화면 가운데쯤 보이던 목록이 그 자리에 있게 한다 (영상이 위에 생기거나 없어져도 목록이 안 움직이게)
  const changeMode = (m: PlayerMode) => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    keepPlace(el && !el.closest(".player") ? { el, top: el.getBoundingClientRect().top } : null);
    setMode(m);
  };

  // 이전/다음(그리고 곡이 끝났을 때의 자동 다음)은 지금 화면에 보이는 클립 목록 순서를 따른다
  const step = (dir: -1 | 1) => {
    // 이전: 3초 넘게 들었으면 처음부터, 아니면 앞 곡 (유튜브 뮤직과 같은 방식)
    if (dir === -1 && time > 3) {
      frameRef.current?.contentWindow?.postMessage({ cmd: "PseekTo", seconds: 0 }, "*");
      return;
    }
    const next = neighborThumb(current.titleNo, dir);
    if (next) play(...thumbClip(next));
  };

  return (
    <div className={isBar ? "player player--bar" : "player"}>
      <div className="player__frame" aria-hidden={isBar || undefined}>
        <iframe
          ref={frameRef}
          key={current.titleNo}
          src={`${embedUrl(current.titleNo)}?fromApi=1`}
          title={`SOOP 플레이어: ${current.label}`}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          tabIndex={isBar ? -1 : undefined}
        />
      </div>
      {isBar && total > 0 && (
        <div className="player__progress" aria-hidden>
          <i style={{ width: `${Math.min(100, (time / total) * 100)}%` }} />
        </div>
      )}
      <div className="player__bar">
        {isBar && (
          <span className="player__controls">
            <button type="button" className="player__skip" onClick={() => step(-1)} aria-label="이전 곡">
              <Icon d="M6 5h2v14H6zM20 5v14L9 12z" />
            </button>
            <button
              type="button"
              className="player__toggle-play"
              onClick={() => send(playing ? "Ppause" : "Pplay")}
              aria-label={playing ? "일시정지" : "재생"}
            >
              <Icon d={playing ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} />
            </button>
            <button type="button" className="player__skip" onClick={() => step(1)} aria-label="다음 곡">
              <Icon d="M16 5h2v14h-2zM4 5v14l11-7z" />
            </button>
          </span>
        )}
        <span className="player__now">
          {(!isBar || playing) && <span className="player__eq" aria-hidden><i /><i /><i /></span>}
          <span className="player__text">
            <span className="player__title">{current.label}</span>
            {isBar && (
              <span className="player__time num">
                {formatDuration(time * 1000)}
                {total > 0 && ` / ${formatDuration(total * 1000)}`}
              </span>
            )}
          </span>
        </span>
        <span className="player__actions">
          {!docked && <ModeToggle mode={mode} setMode={changeMode} />}
          {!isBar && (
            <a href={soopUrl(current.titleNo)} target="_blank" rel="noopener noreferrer">SOOP<span className="player__long">에서 보기</span> ↗</a>
          )}
          <button type="button" onClick={stop} aria-label="플레이어 닫기">✕</button>
        </span>
      </div>
    </div>
  );
}

/** 지금 화면에 보이는 클립 목록(썸네일 버튼 순서)에서 titleNo의 앞/뒤 클립 */
function neighborThumb(titleNo: number, dir: -1 | 1) {
  const list = Array.from(document.querySelectorAll<HTMLElement>("button.thumb[data-title-no]"));
  const i = list.findIndex((el) => Number(el.dataset.titleNo) === titleNo);
  return i < 0 ? undefined : list[i + dir];
}

/** 썸네일 버튼에 적어 둔 클립 정보 → play()에 넘길 값 */
function thumbClip(el: HTMLElement): [number, string, number | undefined] {
  return [Number(el.dataset.titleNo), el.dataset.label ?? "", Number(el.dataset.durationMs) || undefined];
}

/**
 * 자리 지키기: 3초 동안 anchor 요소가 화면에서 같은 높이에 있게 되돌린다 (anchor가 없으면 스크롤 위치를 지킨다).
 * 직접 스크롤(휠/터치/키보드)하면 바로 멈춘다. 멈추는 함수를 돌려준다.
 */
function keepPlace(anchor: { el: Element; top: number } | null) {
  const y0 = window.scrollY;
  const fix = () => {
    const d = anchor ? anchor.el.getBoundingClientRect().top - anchor.top : y0 - window.scrollY;
    if (Math.abs(d) > 2) window.scrollBy(0, d);
  };
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener("scroll", fix);
    for (const t of ["wheel", "touchstart", "keydown"]) window.removeEventListener(t, stop, true);
  };
  const timer = setTimeout(stop, 3000);
  requestAnimationFrame(fix);
  window.addEventListener("scroll", fix);
  for (const t of ["wheel", "touchstart", "keydown"]) window.addEventListener(t, stop, true);
  return stop;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function ModeToggle({ mode, setMode }: { mode: PlayerMode; setMode: (m: PlayerMode) => void }) {
  return (
    <span className="player__mode" role="group" aria-label="플레이어 모양">
      <button type="button" aria-pressed={mode === "video"} onClick={() => setMode("video")}>영상</button>
      <button type="button" aria-pressed={mode === "bar"} onClick={() => setMode("bar")}>바</button>
    </span>
  );
}
