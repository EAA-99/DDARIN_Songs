"use client";

import { useState, useTransition } from "react";
import { applyArtistAction, editClipAction, setStatusAction } from "@/app/admin/actions";
import { formatCount, formatDate, soopUrl } from "@/lib/links";
import { ClipPlay } from "./PlayButtons";

export type AdminRow = {
  titleNo: number; titleRaw: string; regDate: Date; readCnt: number; status: string; locked: boolean;
  performers: string[]; performanceId: number | null; songId: number | null; songTitle: string | null;
  songSlug: string | null; artist: string | null;
};

const STATUS_LABEL: Record<string, string> = { auto: "자동", confirmed: "확인됨", review: "확인 필요", not_song: "노래 아님", gone: "삭제됨" };

function Row({ row, checked, onCheck }: { row: AdminRow; checked: boolean; onCheck: (v: boolean) => void }) {
  const [song, setSong] = useState(row.songTitle ?? "");
  const [artist, setArtist] = useState(row.artist ?? "");
  const [people, setPeople] = useState((row.performers.length ? row.performers : ["따린"]).join(", "));
  const [same, setSame] = useState(0);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const dirty = song !== (row.songTitle ?? "") || artist !== (row.artist ?? "") || people !== row.performers.join(", ");

  const save = () => start(async () => {
    if (!song.trim()) { setMsg("곡명을 적어 주세요"); return; }
    const r = await editClipAction(row.titleNo, { songTitle: song, artist, performers: people });
    setSame(artist.trim() ? r.sameSongCount : 0);
    setMsg("저장했어요");
  });
  const applyAll = () => start(async () => {
    const n = await applyArtistAction(row.titleNo, artist);
    setSame(0);
    setMsg(`같은 곡 ${n}개에 적용했어요`);
  });

  return (
    <tr>
      <td><input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label="선택" /></td>
      <td className="admin-title">
        <div className="admin-title__row">
          <ClipPlay titleNo={row.titleNo} label={row.titleRaw} />
          <a href={soopUrl(row.titleNo)} target="_blank" rel="noopener noreferrer">{row.titleRaw}</a>
        </div>
        <small className="num">
          {formatDate(row.regDate)} · 조회 {formatCount(row.readCnt)} · {STATUS_LABEL[row.status] ?? row.status}
          {row.locked && " · 🔒"}{row.performanceId && ` · 무대 #${row.performanceId}`}{row.songId && ` · 곡 #${row.songId}`}
        </small>
        {same > 0 && (
          <div className="admin-notice">
            같은 곡명 클립 {same}개에도 원곡 가수 ‘{artist}’를 적용할까요?{" "}
            <button type="button" onClick={applyAll} disabled={pending}>모두 적용</button>
          </div>
        )}
      </td>
      <td><input value={song} onChange={(e) => setSong(e.target.value)} placeholder="곡명" aria-label="곡명" /></td>
      <td><input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="원곡 가수" aria-label="원곡 가수" /></td>
      <td><input value={people} onChange={(e) => setPeople(e.target.value)} placeholder="따린, 구슬요" aria-label="부른 사람(쉼표로 구분)" /></td>
      <td className="admin-actions">
        <button type="button" onClick={save} disabled={pending || (!dirty && row.status !== "review")}>
          {row.status === "review" && !dirty ? "이대로 저장" : "저장"}
        </button>
        {msg && <small>{msg}</small>}
      </td>
    </tr>
  );
}

/** 관리자 표: 바로 고치기 + 여러 개 선택해 승인/노래 아님 */
export function AdminTable({ rows }: { rows: AdminRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const toggle = (no: number, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(no); else n.delete(no); return n; });
  const bulk = (status: "confirmed" | "not_song") => start(async () => {
    const n = await setStatusAction([...selected], status);
    setMsg(`${n}개를 ${status === "confirmed" ? "공개" : "노래 아님으로"} 바꿨어요`);
    setSelected(new Set());
  });
  if (rows.length === 0) return <p className="empty">이 목록은 비어 있어요</p>;
  return (
    <>
      <div className="admin-bulk">
        <label><input type="checkbox" checked={selected.size === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.titleNo)) : new Set())} /> 이 쪽 모두</label>
        <span className="num">{selected.size}개 선택</span>
        <button type="button" disabled={pending || selected.size === 0} onClick={() => bulk("confirmed")}>승인(공개)</button>
        <button type="button" disabled={pending || selected.size === 0} onClick={() => bulk("not_song")}>노래 아님</button>
        {msg && <small>{msg}</small>}
      </div>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead><tr><th /><th>원래 제목</th><th>곡명</th><th>원곡 가수</th><th>부른 사람</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => <Row key={r.titleNo} row={r} checked={selected.has(r.titleNo)} onCheck={(v) => toggle(r.titleNo, v)} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}
