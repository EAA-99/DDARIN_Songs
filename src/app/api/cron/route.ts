import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { fetchClipDetail, fetchClipPage } from "@/lib/soop";
import { CATALOG_TAG } from "@/server/cached";
import { runDaily } from "@/server/sync";

export const maxDuration = 300;

/** Vercel Cron 진입점(하루 1회). CRON_SECRET이 맞을 때만 실행한다. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDaily(getDb(), { fetchPage: fetchClipPage, fetchDetail: fetchClipDetail, now: () => new Date() }, "daily");
  if (result.newClips > 0 || result.updatedViews > 0) revalidateTag(CATALOG_TAG, "max");
  return Response.json(result, { status: result.status === "error" ? 500 : 200 });
}
