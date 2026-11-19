export const embedUrl = (titleNo: number) => `https://vod.sooplive.com/player/${titleNo}/embed`;
export const soopUrl = (titleNo: number) => `https://vod.sooplive.com/player/${titleNo}`;
export const CHANNEL_URL = "https://www.sooplive.com/station/insome0319";
export const PROFILE_IMG = "https://stimg.sooplive.co.kr/LOGO/in/insome0319/insome0319.jpg";
export const songHref = (slug: string) => `/song/${encodeURIComponent(slug)}`;
export const artistHref = (name: string) => `/artist/${encodeURIComponent(name)}`;

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** KST 날짜 "2026.11.17" */
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/\s/g, "").replace(/\.$/, "");
}

/** KST 날짜 "11.17" */
export function formatShortDate(d: Date): string {
  return formatDate(d).slice(5);
}

export function formatCount(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만` : n.toLocaleString("ko-KR");
}
