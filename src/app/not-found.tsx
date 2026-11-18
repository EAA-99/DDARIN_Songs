import Link from "next/link";

export default function NotFound() {
  return (
    <p className="empty">
      찾는 페이지가 없어요.<br />
      <Link href="/" style={{ color: "var(--brand-ink)", fontWeight: 600 }}>첫 화면으로</Link>
    </p>
  );
}
