// 실제 클립 제목으로 분류 비율 측정: npx tsx scripts/measure-parser.ts [쪽수=20]
import { writeFileSync } from "node:fs";
import { parseTitle } from "../src/lib/parse-title";

const BASE = "https://api-channel.sooplive.com/v1.3/channel/insome0319/vod/clip";
const pages = Number(process.argv[2] ?? 20);

async function main() {
  const titles: string[] = [];
  for (let page = 1; page <= pages; page++) {
    const q = new URLSearchParams({ startDate: "", endDate: "", keyword: "", orderBy: "reg_date",
      perPage: "60", page: String(page), field: "title,contents,user_nick,user_id" });
    const r = await fetch(`${BASE}?${q}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const d = await r.json();
    for (const c of d.contents) titles.push(c.titleName);
    await new Promise((res) => setTimeout(res, 300));
  }
  writeFileSync("tests/fixtures/titles.json", JSON.stringify(titles, null, 1));
  // 운영과 같게: 자동 분류된 클립의 함께 부른 사람을 partners로 쓴다
  const partners = new Set<string>();
  for (const t of titles) {
    const p = parseTitle(t);
    if (p.status === "auto") p.performers.filter((n) => n !== "따린").forEach((n) => partners.add(n));
  }
  const by: Record<string, string[]> = { auto: [], review: [], not_song: [] };
  for (const t of titles) by[parseTitle(t, partners).status].push(t);
  const n = titles.length;
  for (const k of Object.keys(by)) console.log(k, by[k].length, `${((by[k].length / n) * 100).toFixed(1)}%`);
  const songish = by.auto.length + by.review.length;
  console.log(`review / 노래 후보 = ${((by.review.length / Math.max(1, songish)) * 100).toFixed(1)}%`);
  console.log("--- review 예시"); by.review.slice(0, 30).forEach((t) => console.log(" ", t));
}
main();
