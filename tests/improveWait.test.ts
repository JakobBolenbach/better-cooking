import { describe, expect, it } from "vitest";
import { SYNC_WAIT_MS, orphanWait, recheckIn, sameSourceNote } from "../src/improveWait";

const HOUR = 3_600_000;

describe("orphanWait: a proposal without a note", () => {
  const cases: [string, { age: number; sameSource: boolean }, "waiting" | "orphan"][] = [
    ["young, no note with the source", { age: 3 * 60_000, sameSource: false }, "waiting"],
    ["young, a note with the same source", { age: 3 * 60_000, sameSource: true }, "waiting"],
    ["just under the waiting time", { age: SYNC_WAIT_MS - 1, sameSource: false }, "waiting"],
    ["waiting time over, no note with the source", { age: SYNC_WAIT_MS, sameSource: false }, "orphan"],
    ["waiting time over, a note with the same source", { age: 3 * 24 * HOUR, sameSource: true }, "waiting"],
  ];
  it.each(cases)("%s", (_name, c, expected) => {
    expect(orphanWait({ now: 1_000_000_000 + c.age, firstSeen: 1_000_000_000, sameSource: c.sameSource })).toBe(
      expected,
    );
  });
});

describe("sameSourceNote", () => {
  const notes = [
    { path: "R/A.md", source: "https://other.example/x" },
    { path: "R/B.md", source: "https://www.instagram.com/reel/ABC123/?igsh=xyz" },
    { path: "R/C.md" },
  ];
  it("compares the normalized source like the duplicate check (tracking and the reel/post path do not matter)", () => {
    expect(sameSourceNote("https://www.instagram.com/p/ABC123/", notes)?.path).toBe("R/B.md");
  });
  it("finds nothing for another source, an empty one or one that is no address", () => {
    expect(sameSourceNote("https://www.instagram.com/p/ZZZ999/", notes)).toBeUndefined();
    expect(sameSourceNote(undefined, notes)).toBeUndefined();
    expect(sameSourceNote("kein Link", [{ source: "kein Link" }])).toBeUndefined();
  });
});

describe("recheckIn", () => {
  it("looks again when the waiting time ends, but at least every ten minutes", () => {
    expect(recheckIn(0, 0)).toBe(10 * 60_000);
    expect(recheckIn(SYNC_WAIT_MS - 5000, 0)).toBe(6000);
    expect(recheckIn(SYNC_WAIT_MS + HOUR, 0)).toBe(1000);
  });
});
