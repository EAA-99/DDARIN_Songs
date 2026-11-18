import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListSkeleton, PerformanceList } from "@/components/PerformanceList";
import { Rankings, RankingsSkeleton } from "@/components/Rankings";
import { ControlsSkeleton, SearchControls } from "@/components/SearchControls";
import { getDb } from "@/db";
import { clipsForPerformances, PAGE_SIZE, searchPerformances } from "@/server/queries";

type Search = { q?: string; type?: string; sort?: string; page?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Results({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const s: Search = { q: one(sp.q), type: one(sp.type), sort: one(sp.sort), page: one(sp.page) };
  const type = s.type === "solo" || s.type === "duet" ? s.type : "all";
  const sort = s.sort === "views" ? "views" : "latest";
  const page = Math.max(1, Number(s.page) || 1);
  const db = getDb();
  const { rows, total } = await searchPerformances(db, { q: s.q, type, sort, page });
  const clipsByStage = await clipsForPerformances(db, rows.map((r) => r.id));

  if (total === 0) {
    return s.q || type !== "all"
      ? <p className="empty"><b>‘{s.q ?? (type === "solo" ? "솔로" : "듀엣")}’</b>에 맞는 무대가 없어요.<br />곡명이나 가수 이름을 다르게 적어 보세요.</p>
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
      <p className="result-meta num">무대 {total.toLocaleString("ko-KR")}개{s.q && <> · ‘{s.q}’ 검색 결과</>}</p>
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
    <div className="home">
      <section aria-label="노래 클립 목록">
        <Suspense fallback={<ControlsSkeleton />}><SearchControls /></Suspense>
        <Suspense fallback={<ListSkeleton />}><Results searchParams={searchParams} /></Suspense>
      </section>
      <aside className="home__side" aria-label="순위">
        <Suspense fallback={<RankingsSkeleton />}><Rankings /></Suspense>
      </aside>
    </div>
  );
}
