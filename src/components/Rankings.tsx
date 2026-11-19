import Link from "next/link";
import { connection } from "next/server";
import { formatCount, formatShortDate, songHref } from "@/lib/links";
import { cachedRankings } from "@/server/cached";
import type { PerfRow } from "@/server/queries";
import { stageLabel } from "./PerformanceList";
import { MiniPlay } from "./PlayButtons";
import { RankingTabs } from "./RankingTabs";

function ViewList({ rows }: { rows: PerfRow[] }) {
  if (rows.length === 0) return <p className="rank-empty">이 기간에 올라온 무대가 아직 없어요</p>;
  return (
    <ol className="rank-list">
      {rows.map((r) => (
        <li key={r.id} className="rank-item">
          <MiniPlay titleNo={r.best.titleNo} label={stageLabel(r)} />
          <Link href={songHref(r.songSlug)}>{r.songTitle} <span className="rank-date num">{formatShortDate(r.startedAt)}</span></Link>
          <span className="rank-val num">{formatCount(r.best.readCnt)}</span>
        </li>
      ))}
    </ol>
  );
}

/** 첫 화면 순위 카드 하나: 조회수 TOP 10(이번 주/이번 달/전체) + 많이 부른 곡 TOP 10 */
export async function Rankings() {
  await connection();
  const { week, month, all, songs } = await cachedRankings();
  const songList = songs.length === 0 ? <p className="rank-empty">아직 집계할 무대가 없어요</p> : (
    <ol className="rank-list">
      {songs.map((s) => (
        <li key={s.slug} className="rank-item">
          <Link href={songHref(s.slug)}>{s.title}{s.artist && <span className="rank-date"> {s.artist}</span>}</Link>
          <span className="rank-val num">{s.performances}번</span>
        </li>
      ))}
    </ol>
  );
  return (
    <section className="rank-card" aria-labelledby="rank-title">
      <h2 id="rank-title">인기 순위</h2>
      <RankingTabs lists={{ week: <ViewList rows={week} />, month: <ViewList rows={month} />, all: <ViewList rows={all} />, songs: songList }} />
    </section>
  );
}

export function RankingsSkeleton() {
  return <div className="skeleton" style={{ height: 420 }} />;
}
