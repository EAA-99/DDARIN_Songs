import { expect, test } from "vitest";
import { norm, slugify } from "@/lib/normalize";

test("norm ignores case, spaces and punctuation", () => {
  expect(norm("Feel Good")).toBe(norm("feelgood"));
  expect(norm("Rockin’ Around The Christmas Tree")).toBe(norm("rockin around the christmas tree"));
  expect(norm("HighLight")).toBe(norm("Highlight"));
});

test("slugify makes url-safe slugs", () => {
  expect(slugify("Viva La Vida")).toBe("viva-la-vida");
  expect(slugify("돌고 돌아가는 길")).toBe("돌고-돌아가는-길");
  expect(slugify("!!!")).toBe("x");
});
