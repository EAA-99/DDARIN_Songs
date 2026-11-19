import Link from "next/link";
import { artistHref, formatCount, formatDate, formatDuration, songHref } from "@/lib/links";
import type { ClipItem, PerfRow } from "@/server/queries";
import { ClipPlay, ThumbPlay } from "./PlayButtons";

const ME = "따린";

export const stageLabel = (r: PerfRow) => [r.songTitle, r.artist].filter(Boolean).join(" · ");

function Partners({ names }: { names: string[] }) {
  const others = names.filter((n) => n !== ME);
  if (others.length === 0) return null;
  return (
    <>
      with{" "}
      {others.map((n, i) => (
        <span key={n}>{i > 0 && ", "}<Link href={artistHref(n)}>{n}</Link></span>
      ))}
    </>
  );
}

/** 무대 카드 격자. 카드 하나 = 무대 하나, "클립 N개"를 펼치면 클립별로 재생 */
export function PerformanceList({ rows, clipsByStage, showSong = true }: {
  rows: PerfRow[];
  clipsByStage: Map<number, ClipItem[]>;
  showSong?: boolean;
}) {
  return (
    <ul className="stages">
      {rows.map((r) => {
        const label = stageLabel(r);
        const list = clipsByStage.get(r.id) ?? [];
        return (
          <li key={r.id} className="stage">
            <ThumbPlay titleNo={r.best.titleNo} label={label} thumbUrl={r.best.thumbUrl} durationMs={r.best.durationMs} />
            <div className="stage__body">
              <div className="stage__title">
                {showSong ? <Link href={songHref(r.songSlug)}>{r.songTitle}</Link> : <span>{formatDate(r.startedAt)}</span>}
                {r.isDuet && <span className="badge">듀엣</span>}
              </div>
              <div className="stage__sub">
                {showSong && r.artist && <Link href={artistHref(r.artist)}>{r.artist}</Link>}
                {showSong && r.artist && r.isDuet && " · "}
                <Partners names={r.performers} />
                {!showSong && !r.isDuet && "솔로"}
              </div>
              <div className="stage__meta num">
                {showSong && <span>{formatDate(r.startedAt)}</span>}
                <span>조회 {formatCount(r.best.readCnt)}</span>
              </div>
            </div>
            {list.length > 1 && (
              <details className="clips">
                <summary>클립 {list.length}개</summary>
                <ol>
                  {list.map((c) => (
                    <li key={c.titleNo} className="clip">
                      <ClipPlay titleNo={c.titleNo} label={label} />
                      <b className="num">조회 {formatCount(c.readCnt)}</b>
                      <span className="num">{formatDuration(c.durationMs)} · {c.uploaderNick}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="stages" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton stage-skeleton" />)}
    </div>
  );
}
