"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  backfillStepAction, mergePerformancesAction, mergeSongsAction, splitPerformanceAction, syncNowAction,
} from "@/app/admin/actions";

const describe = (r: { status: string; newClips: number; updatedViews: number; error?: string }) =>
  r.status === "busy" ? "다른 갱신이 이미 실행 중이에요. 잠시 뒤에 다시 눌러 주세요."
    : r.status === "error" ? `실패: ${r.error ?? "알 수 없는 오류"}`
      : `새 클립 ${r.newClips}개 · 조회수 갱신 ${r.updatedViews}개`;

/** 지금 가져오기 + 첫 수집 이어하기 */
export function SyncButtons({ backfillDone }: { backfillDone: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="admin-sync">
      <button type="button" disabled={pending} onClick={() => start(async () => setMsg(describe(await syncNowAction())))}>
        {pending ? "가져오는 중…" : "지금 가져오기"}
      </button>
      {!backfillDone && (
        <button type="button" className="secondary" disabled={pending}
          onClick={() => start(async () => { const r = await backfillStepAction(); setMsg(`${describe(r)} · 첫 수집 ${(r.progress * 100).toFixed(0)}%`); })}>
          첫 수집 이어하기
        </button>
      )}
      {msg && <span>{msg}</span>}
    </div>
  );
}

function NumForm({ title, fields, run }: { title: string; fields: string[]; run: (v: string[]) => Promise<string> }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      try { setMsg(await run(fields.map((f) => String(data.get(f) ?? "")))); } catch (err) { setMsg(`실패: ${(err as Error).message}`); }
    });
  };
  return (
    <form className="admin-tool" onSubmit={submit}>
      <b>{title}</b>
      {fields.map((f) => <input key={f} name={f} placeholder={f} required />)}
      <button type="submit" disabled={pending}>실행</button>
      {msg && <small>{msg}</small>}
    </form>
  );
}

const nums = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(Number);

/** 곡 합치기 · 무대 합치기/나누기 (번호는 표의 "곡 #", "무대 #") */
export function MergeTools() {
  return (
    <div className="admin-tools">
      <NumForm title="곡 합치기" fields={["남길 곡 #", "합칠 곡 #"]}
        run={async ([a, b]) => { await mergeSongsAction(Number(a), Number(b)); return "합쳤어요"; }} />
      <NumForm title="무대 합치기" fields={["남길 무대 #", "합칠 무대 #"]}
        run={async ([a, b]) => { await mergePerformancesAction(Number(a), Number(b)); return "합쳤어요"; }} />
      <NumForm title="무대 나누기" fields={["무대 #", "떼어낼 클립 번호(쉼표)"]}
        run={async ([a, b]) => `새 무대 #${await splitPerformanceAction(Number(a), nums(b))}`} />
    </div>
  );
}
