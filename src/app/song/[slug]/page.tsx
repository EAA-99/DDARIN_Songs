import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackLink } from "@/components/BackLink";
import { ListSkeleton, PerformanceList } from "@/components/PerformanceList";
import { ViewToggle } from "@/components/ViewToggle";
import { getDb } from "@/db";
import { artistHref, songHref } from "@/lib/links";
import { cachedSongPage } from "@/server/cached";
import { clipsForPerformances } from "@/server/queries";

type Props = PageProps<"/song/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const data = await cachedSongPage(decodeURIComponent(slug), "latest");
  return data ? { title: data.song.artist ? `${data.song.title} - ${data.song.artist}` : data.song.title } : {};
}

async function Song({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const sp = await searchParams;
  const sort = sp.sort === "views" ? "views" : "latest";
  const db = getDb();
  const data = await cachedSongPage(decodeURIComponent(slug), sort);
  if (!data) notFound();
  const clipsByStage = await clipsForPerformances(db, data.performances.map((r) => r.id));
  return (
    <>
      <header className="page-head">
        <BackLink />
        <h1>{data.song.title}</h1>
        <p className="num">
          {data.song.artist && <>원곡 <Link href={artistHref(data.song.artist)}>{data.song.artist}</Link> · </>}
          클립 <strong>{data.clipCount}개</strong>
        </p>
      </header>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <Link className="chip" aria-pressed={sort === "latest"} href={songHref(data.song.slug)}>최신순</Link>
        <Link className="chip" aria-pressed={sort === "views"} href={`${songHref(data.song.slug)}?sort=views`}>조회수순</Link>
        <ViewToggle />
      </div>
      <PerformanceList rows={data.performances} clipsByStage={clipsByStage} showSong={false} />
    </>
  );
}

export default function SongPage(props: Props) {
  return <Suspense fallback={<ListSkeleton rows={3} />}><Song {...props} /></Suspense>;
}
