import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListSkeleton, PerformanceList } from "@/components/PerformanceList";
import { Rankings, RankingsSkeleton } from "@/components/Rankings";
import { FilterBar, FilterSkeleton, SearchBox, SearchSkeleton } from "@/components/SearchControls";
import { getDb } from "@/db";
import { PROFILE_IMG } from "@/lib/links";
import { cachedStats } from "@/server/cached";
import { clipsForPerformances, PAGE_SIZE, searchPerformances } from "@/server/queries";

type Search = { q?: string; type?: string; sort?: string; page?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Stats() {
  await connection();
  const s = await cachedStats();
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  return (
    <dl className="intro__stats num">
      <div><dt>곡</dt><dd>{fmt(s.songs)}</dd></div>
      <div><dt>클립</dt><dd>{fmt(s.clips)}</dd></div>
    </dl>
  );
}

async function Results({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const s: Search = { q: one(sp.q), type: one(sp.type), sort: one(sp.sort), page: one(sp.page) };
  const type = s.type === "solo" || s.type === "duet" ? s.type : "all";
  const sort = s.sort === "views" ? "views" : "latest";
  const page = Math.max(1, Number(s.page) || 1);
  const db = getDb();
  const { rows, total, songs, clips } = await searchPerformances(db, { q: s.q, type, sort, page });
  const clipsByStage = await clipsForPerformances(db, rows.map((r) => r.id));

  if (total === 0) {
    return s.q || type !== "all"
      ? <p className="empty"><b>‘{s.q ?? (type === "solo" ? "솔로" : "듀엣")}’</b>에 맞는 노래가 없어요.<br />곡명이나 가수 이름을 다르게 적어 보세요.</p>
      : <p className="empty">아직 모은 노래 클립이 없어요.<br />첫 수집이 끝나면 여기에 나타납니다.</p>;
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const href = (p: number) => {
    const next = new URLSearchParams(Object.entries(s).filter(([, v]) => v) as [string, string][]);
    if (p > 1) next.set("page", String(p)); else next.delete("page");
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };
  return (
    <>
      <p className="result-meta num">
        곡 {songs.toLocaleString("ko-KR")}개 · 클립 {clips.toLocaleString("ko-KR")}개{s.q && <> · ‘{s.q}’ 검색 결과</>}
      </p>
      <PerformanceList rows={rows} clipsByStage={clipsByStage} />
      {pages > 1 && (
        <nav className="pager num" aria-label="페이지">
          {page > 1 && <Link href={href(page - 1)} scroll={false}>← 이전</Link>}
          <span>{page} / {pages}</span>
          {page < pages && <Link href={href(page + 1)} scroll={false}>다음 →</Link>}
        </nav>
      )}
    </>
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <section className="intro">
        <div className="wrap intro__inner">
          <div className="intro__head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="intro__avatar" src={PROFILE_IMG} alt="따린" width={72} height={72} referrerPolicy="no-referrer" />
            <div>
              <h1>따린이 부른 노래, 한곳에서</h1>
              <p>시청자들이 남긴 SOOP 클립을 곡별로 모았어요. 곡명이나 가수를 검색해 보세요.</p>
            </div>
          </div>
          <Suspense fallback={<SearchSkeleton />}><SearchBox /></Suspense>
          <Suspense fallback={<dl className="intro__stats" />}><Stats /></Suspense>
        </div>
      </section>
      <div className="wrap home">
        <section aria-label="노래 클립 목록">
          <Suspense fallback={<FilterSkeleton />}><FilterBar /></Suspense>
          <Suspense fallback={<ListSkeleton />}><Results searchParams={searchParams} /></Suspense>
        </section>
        <aside className="home__side" aria-label="순위">
          <Suspense fallback={<RankingsSkeleton />}><Rankings /></Suspense>
        </aside>
      </div>
    </>
  );
}
