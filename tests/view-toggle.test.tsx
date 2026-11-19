// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ViewToggle } from "@/components/ViewToggle";

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.view; });
afterEach(cleanup);

test("starts in image view; the list button switches to a title-only list and is remembered", () => {
  render(<ViewToggle />);
  const image = screen.getByRole("button", { name: "이미지로 보기" });
  const list = screen.getByRole("button", { name: "목록으로 보기" });
  expect(image.getAttribute("aria-pressed")).toBe("true");
  expect(document.documentElement.dataset.view).toBeUndefined();

  fireEvent.click(list);
  expect(list.getAttribute("aria-pressed")).toBe("true");
  expect(document.documentElement.dataset.view).toBe("list");
  expect(localStorage.getItem("view")).toBe("list");

  fireEvent.click(image);
  expect(document.documentElement.dataset.view).toBeUndefined();
  expect(localStorage.getItem("view")).toBeNull();
});

test("a remembered list view is shown as selected", async () => {
  localStorage.setItem("view", "list");
  document.documentElement.dataset.view = "list";
  await act(async () => { render(<ViewToggle />); });
  expect(screen.getByRole("button", { name: "목록으로 보기" }).getAttribute("aria-pressed")).toBe("true");
});
