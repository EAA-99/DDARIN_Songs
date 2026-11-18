"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

const TYPES = [["all", "전체"], ["solo", "솔로"], ["duet", "듀엣"]] as const;
const SORTS = [["latest", "최신순"], ["views", "조회수순"]] as const;

/** 검색·필터·정렬. 상태는 주소(?q=&type=&sort=)에 담아 공유할 수 있게 한다. */
export function SearchControls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const type = params.get("type") ?? "all";
  const sort = params.get("sort") ?? "latest";

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === "type" && v === "all") || (k === "sort" && v === "latest")) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go({ q: q.trim() }); };

  return (
    <div className="controls">
      <form className="search" role="search" onSubmit={submit}>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="곡명, 가수, 함께 부른 사람" aria-label="곡명, 가수, 함께 부른 사람 검색" enterKeyHint="search"
        />
        <button type="submit">검색</button>
      </form>
      <div className="toolbar">
        {TYPES.map(([v, label]) => (
          <button key={v} type="button" className="chip" aria-pressed={type === v} onClick={() => go({ type: v })}>{label}</button>
        ))}
        <div className="sort" role="group" aria-label="정렬">
          {SORTS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={sort === v} onClick={() => go({ sort: v })}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ControlsSkeleton() {
  return <div className="controls"><div className="skeleton" style={{ height: 46, borderRadius: 999 }} /><div className="skeleton" style={{ height: 32 }} /></div>;
}
