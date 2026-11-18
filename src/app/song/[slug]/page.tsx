import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListSkeleton, PerformanceList } from "@/components/PerformanceList";
import { getDb } from "@/db";
import { artistHref, songHref } from "@/lib/links";
import { clipsForPerformances, songPage } from "@/server/queries";

type Props = PageProps<"/song/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const data = await songPage(getDb(), decodeURIComponent(slug), "latest");
  return data ? { title: data.song.artist ? `${data.song.title} - ${data.song.artist}` : data.song.title } : {};
}

async function Song({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const sp = await searchParams;
  const sort = sp.sort === "views" ? "views" : "latest";
  const db = getDb();
  const data = await songPage(db, decodeURIComponent(slug), sort);
  if (!data) notFound();
  const clipsByStage = await clipsForPerformances(db, data.performances.map((r) => r.id));
  return (
    <>
      <header className="page-head">
        <h1>{data.song.title}</h1>
        <p className="num">
          {data.song.artist && <>원곡 <Link href={artistHref(data.song.artist)}>{data.song.artist}</Link> · </>}
          따린님이 부른 무대 <strong>{data.performances.length}번</strong> · 클립 {data.clipCount}개
        </p>
      </header>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <Link className="chip" aria-pressed={sort === "latest"} href={songHref(data.song.slug)}>무대별(최신)</Link>
        <Link className="chip" aria-pressed={sort === "views"} href={`${songHref(data.song.slug)}?sort=views`}>조회수순</Link>
      </div>
      <PerformanceList rows={data.performances} clipsByStage={clipsByStage} showSong={false} />
    </>
  );
}

export default function SongPage(props: Props) {
  return <Suspense fallback={<ListSkeleton rows={3} />}><Song {...props} /></Suspense>;
}
