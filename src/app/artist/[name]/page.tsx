import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackLink } from "@/components/BackLink";
import { ListSkeleton, PerformanceList } from "@/components/PerformanceList";
import { getDb } from "@/db";
import { songHref } from "@/lib/links";
import { cachedArtistPage } from "@/server/cached";
import { clipsForPerformances } from "@/server/queries";

type Props = PageProps<"/artist/[name]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { name } = await params;
  const data = await cachedArtistPage(decodeURIComponent(name));
  return data ? { title: data.name } : {};
}

async function Artist({ params }: Props) {
  await connection();
  const { name } = await params;
  const db = getDb();
  const data = await cachedArtistPage(decodeURIComponent(name));
  if (!data) notFound();
  const clipsByStage = await clipsForPerformances(db, data.asPartner.map((r) => r.id));
  const originalClips = data.asOriginal.reduce((a, s) => a + s.clips, 0);
  const partnerSongs = new Set(data.asPartner.map((r) => r.songSlug)).size;
  const partnerClips = data.asPartner.reduce((a, r) => a + r.clipCount, 0);
  return (
    <>
      <header className="page-head">
        <BackLink />
        <h1>{data.name}</h1>
        <p className="num">
          {data.asOriginal.length > 0 && <>따린님이 부른 곡 <strong>{data.asOriginal.length}곡</strong> · 클립 {originalClips}개</>}
          {data.asOriginal.length > 0 && data.asPartner.length > 0 && " · "}
          {data.asPartner.length > 0 && <>따린님과 함께 부른 곡 <strong>{partnerSongs}곡</strong> · 클립 {partnerClips}개</>}
        </p>
      </header>
      {data.asOriginal.length > 0 && (
        <>
          <h2 className="section-title">따린님이 부른 {data.name}의 곡</h2>
          <ul className="song-list">
            {data.asOriginal.map((s) => (
              <li key={s.slug}><Link href={songHref(s.slug)}>{s.title}<span className="num">클립 {s.clips}개</span></Link></li>
            ))}
          </ul>
        </>
      )}
      {data.asPartner.length > 0 && (
        <>
          <h2 className="section-title">따린님과 함께 부른 노래</h2>
          <PerformanceList rows={data.asPartner} clipsByStage={clipsByStage} />
        </>
      )}
    </>
  );
}

export default function ArtistPage(props: Props) {
  return <Suspense fallback={<ListSkeleton rows={3} />}><Artist {...props} /></Suspense>;
}
