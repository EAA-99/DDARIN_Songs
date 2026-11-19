import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
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
  const stages = data.asOriginal.reduce((a, s) => a + s.performances, 0);
  return (
    <>
      <header className="page-head">
        <h1>{data.name}</h1>
        <p className="num">
          {data.asOriginal.length > 0 && <>따린님이 부른 곡 <strong>{data.asOriginal.length}곡</strong> · 무대 {stages}번</>}
          {data.asOriginal.length > 0 && data.asPartner.length > 0 && " · "}
          {data.asPartner.length > 0 && <>따린님과 함께한 무대 <strong>{data.asPartner.length}번</strong></>}
        </p>
      </header>
      {data.asOriginal.length > 0 && (
        <>
          <h2 className="section-title">따린님이 부른 {data.name}의 곡</h2>
          <ul className="song-list">
            {data.asOriginal.map((s) => (
              <li key={s.slug}><Link href={songHref(s.slug)}>{s.title}<span className="num">무대 {s.performances}번</span></Link></li>
            ))}
          </ul>
        </>
      )}
      {data.asPartner.length > 0 && (
        <>
          <h2 className="section-title">따린님과 함께 부른 무대</h2>
          <PerformanceList rows={data.asPartner} clipsByStage={clipsByStage} />
        </>
      )}
    </>
  );
}

export default function ArtistPage(props: Props) {
  return <Suspense fallback={<ListSkeleton rows={3} />}><Artist {...props} /></Suspense>;
}
