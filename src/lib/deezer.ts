import { z } from "zod";
import { norm } from "./normalize";
import { Throttle } from "./soop";

/** 곡명이 음원으로 있는지와, 확실할 때만 원곡 가수 */
export type SongLookup = (title: string) => Promise<{ found: boolean; artist: string | null }>;

export class DeezerError extends Error {}

const Res = z.object({
  data: z.array(z.object({ title: z.string(), rank: z.number(), artist: z.object({ name: z.string() }) })),
});

/** 비교용: 괄호 안("(Live)", "(feat. …)")을 빼고 정규화 */
const key = (s: string) => norm(s.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));

/** 같은 곡명 결과를 가수별로 묶어 rank를 더한다. 1위가 2위의 2배 이상(또는 가수 하나)일 때만 그 가수 */
export function pickArtist(hits: { artist: string; rank: number }[]): string | null {
  const sum = new Map<string, number>();
  for (const h of hits) sum.set(h.artist, (sum.get(h.artist) ?? 0) + h.rank);
  const [first, second] = [...sum].sort((a, b) => b[1] - a[1]);
  if (!first) return null;
  return !second || first[1] >= second[1] * 2 ? first[0] : null;
}

/** 동시 2개·300ms 간격으로 묶는다(Deezer 제한: 5초에 50번) */
export function throttled(lookup: SongLookup, t = new Throttle(2, 300)): SongLookup {
  return (title) => t.run(() => lookup(title));
}

/** Deezer 검색(키 불필요). 응답이 이상하면 DeezerError(호출한 쪽이 나중에 다시 검사) */
export function searchDeezer(f: typeof fetch = fetch): SongLookup {
  return async (title) => {
    const url = `https://api.deezer.com/search/track?${new URLSearchParams({ q: title, limit: "25" })}`;
    let res: Response;
    try {
      res = await f(url, { headers: { "User-Agent": "Mozilla/5.0 (ttarin-songs)" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      throw new DeezerError(`Deezer 요청 실패: ${(e as Error).message}`);
    }
    if (!res.ok) throw new DeezerError(`Deezer 응답 오류 ${res.status}`);
    const parsed = Res.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new DeezerError("Deezer 응답 형식이 다릅니다");
    const k = key(title);
    if (!k) return { found: false, artist: null };
    const hits = parsed.data.data.filter((t) => key(t.title) === k).map((t) => ({ artist: t.artist.name, rank: t.rank }));
    return { found: hits.length > 0, artist: pickArtist(hits) };
  };
}
