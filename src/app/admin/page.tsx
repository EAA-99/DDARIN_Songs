import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { AdminTable } from "@/components/AdminTable";
import { MergeTools, SyncButtons } from "@/components/AdminTools";
import { getDb } from "@/db";
import { syncRuns, syncState } from "@/db/schema";
import { formatDate } from "@/lib/links";
import { ADMIN_PAGE_SIZE, adminCounts, adminList, type AdminTab } from "@/server/admin";
import { requireAdmin } from "@/server/session";
import { backfillWindows } from "@/server/sync";
import { logout } from "./login/actions";

export const maxDuration = 300;

const TABS: [AdminTab, string][] = [["review", "확인 필요"], ["noArtist", "원곡 가수 없음"], ["public", "공개 중"], ["notSong", "노래 아님"]];
const KIND: Record<string, string> = { daily: "자동", manual: "수동", backfill: "첫 수집" };

async function Admin({ searchParams }: PageProps<"/admin">) {
  await connection();
  await requireAdmin();
  const sp = await searchParams;
  const tab = (TABS.find(([t]) => t === sp.tab)?.[0] ?? "review") as AdminTab;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = getDb();
  const [counts, list, runs, [bf]] = await Promise.all([
    adminCounts(db), adminList(db, tab, q, page),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(5),
    db.select().from(syncState).where(eq(syncState.key, "backfill")),
  ]);
  const windows = backfillWindows(new Date()).length;
  const bfIdx = (bf?.value as { idx?: number } | undefined)?.idx ?? 0;
  const backfillDone = bfIdx >= windows;
  const last = runs[0];
  const failed = runs.find((r) => r.error);
  const href = (p: Record<string, string | number>) => `/admin?${new URLSearchParams({ tab, ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) })}`;
  const pages = Math.ceil(list.total / ADMIN_PAGE_SIZE);

  return (
    <div className="admin">
      <div className="admin-status">
        <div>
          {last ? <>마지막 갱신 <b className="num">{formatDate(last.startedAt)} {last.startedAt.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}</b> ({KIND[last.kind]}) · 새 클립 {last.newClips} · 조회수 {last.updatedViews}</> : "아직 갱신한 적이 없어요"}
          {failed && <span className="admin-error"> · ⚠ 최근 실패: {failed.error}</span>}
          {!backfillDone && <span> · 첫 수집 <b className="num">{Math.round((bfIdx / windows) * 100)}%</b></span>}
        </div>
        <SyncButtons backfillDone={backfillDone} />
      </div>

      <nav className="admin-tabs">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/admin?tab=${t}`} className="chip" aria-pressed={t === tab}>{label} <span className="num">{counts[t].toLocaleString("ko-KR")}</span></Link>
        ))}
        <form className="admin-search" action="/admin">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="제목·곡명 검색" aria-label="제목·곡명 검색" />
        </form>
      </nav>

      <AdminTable key={`${tab}-${q}-${page}`} rows={list.rows} />
      {pages > 1 && (
        <nav className="pager num">
          {page > 1 && <Link href={href({ page: page - 1 })}>← 이전</Link>}
          <span>{page} / {pages}</span>
          {page < pages && <Link href={href({ page: page + 1 })}>다음 →</Link>}
        </nav>
      )}

      <h2 className="section-title">합치기 · 나누기</h2>
      <MergeTools />
      <form action={logout} className="admin-logout"><button type="submit">로그아웃</button></form>
    </div>
  );
}

export default function AdminPage(props: PageProps<"/admin">) {
  return <Suspense fallback={<div className="skeleton" style={{ height: 400 }} />}><Admin {...props} /></Suspense>;
}
