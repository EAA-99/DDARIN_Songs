"use client";

import { useState, type ReactNode } from "react";

const TABS = [["week", "이번 주"], ["month", "이번 달"], ["all", "전체"], ["songs", "많이 부른 곡"]] as const;
type Tab = (typeof TABS)[number][0];

/** 순위 카드의 탭: 조회수 TOP 10(기간 셋) + 많이 부른 곡. 목록은 서버에서 미리 그려 받는다. */
export function RankingTabs({ lists }: { lists: Record<Tab, ReactNode> }) {
  const [tab, setTab] = useState<Tab>("week");
  return (
    <>
      <div className="rank-tabs" role="group" aria-label="순위 종류">
        {TABS.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)}>{label}</button>
        ))}
      </div>
      <p className="rank-hint">{tab === "songs" ? "부른 횟수 기준" : "조회수 높은 순 · 같은 곡은 한 번만"}</p>
      {lists[tab]}
    </>
  );
}
