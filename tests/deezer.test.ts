import { expect, test } from "vitest";
import { DeezerError, pickArtist, searchDeezer } from "@/lib/deezer";

const track = (title: string, artist: string, rank: number) => ({ title, rank, artist: { name: artist } });
const fakeFetch = (body: unknown, status = 200, seen?: string[]) =>
  (async (url: string | URL) => {
    seen?.push(String(url));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;

test("only an exact (normalized) title counts, and the query is built", async () => {
  const seen: string[] = [];
  const lookup = searchDeezer(fakeFetch({ data: [track("New Golden Age", "Keane", 900000)] }, 200, seen));
  expect(await lookup("Golden")).toEqual({ found: false, artist: null });
  const u = new URL(seen[0]);
  expect(u.origin + u.pathname).toBe("https://api.deezer.com/search/track");
  expect(u.searchParams.get("q")).toBe("Golden");
  expect(u.searchParams.get("limit")).toBe("25");
});

test("parentheses and case are ignored when comparing", async () => {
  const lookup = searchDeezer(fakeFetch({ data: [track("golden (Live)", "HUNTR/X", 979012), track("Golden", "Harry Styles", 300000)] }));
  expect(await lookup("Golden")).toEqual({ found: true, artist: "HUNTR/X" });
});

test("pickArtist: summed rank must be at least twice the runner-up", () => {
  expect(pickArtist([{ artist: "Hozier", rank: 962821 }, { artist: "Bossa Nova Covers", rank: 609482 }, { artist: "Hozier", rank: 566127 }])).toBe("Hozier");
  expect(pickArtist([{ artist: "A", rank: 100000 }, { artist: "B", rank: 100000 }, { artist: "C", rank: 100000 }])).toBeNull();
  expect(pickArtist([{ artist: "Seo Moon Tak", rank: 26247 }, { artist: "Seo Moon Tak", rank: 11710 }])).toBe("Seo Moon Tak");
  expect(pickArtist([])).toBeNull();
});

test.each([
  ["HTTP 500", fakeFetch({}, 500)],
  ["error body", fakeFetch({ error: { type: "Exception", message: "Quota limit exceeded", code: 4 } })],
  ["not JSON", fakeFetch("<html>", 200)],
])("%s → DeezerError", async (_, f) => {
  await expect(searchDeezer(f)("Golden")).rejects.toBeInstanceOf(DeezerError);
});
