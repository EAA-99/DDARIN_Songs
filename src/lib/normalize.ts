/** 비교용 정규화: 대소문자·공백·문장부호 차이를 없앤다. "Feel Good" == "feelgood" */
export function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s'’‘"“”·.,!?~\-_()[\]]/g, "");
}

/** 주소용 slug. 한글은 그대로 두고 공백은 '-'로. */
export function slugify(s: string): string {
  const slug = s.normalize("NFKC").toLowerCase().trim()
    .replace(/\s+/g, "-")
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "x";
}
