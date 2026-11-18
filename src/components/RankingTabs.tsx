"use client";

import { useState, type ReactNode } from "react";

const TABS = [["week", "이번 주"], ["month", "이번 달"], ["all", "전체"]] as const;
type Tab = (typeof TABS)[number][0];

/** 조회수 TOP 10의 기간 탭. 세 목록은 서버에서 미리 그려 받는다. */
export function RankingTabs({ lists }: { lists: Record<Tab, ReactNode> }) {
  const [tab, setTab] = useState<Tab>("week");
  return (
    <>
      <div className="rank-tabs" role="group" aria-label="기간">
        {TABS.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)}>{label}</button>
        ))}
      </div>
      {lists[tab]}
    </>
  );
}
