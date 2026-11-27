import { describe, expect, it } from "vitest";
import {
  RESUME_MAX,
  RESUME_MS,
  RESUME_SKEW_MS,
  createResume,
  prune,
  remember,
  restoreResume,
  startStep,
  type ResumeEntry,
} from "../src/cookingResume";

function device(start = 1_000_000) {
  let stored: unknown = undefined;
  let t = start;
  const api = createResume({
    now: () => t,
    load: () => stored,
    save: (v) => (stored = v === null ? undefined : (JSON.parse(JSON.stringify(v)) as unknown)),
  });
  return { api, advance: (ms: number) => (t += ms), stored: () => stored };
}

describe("continue cooking at the last step (issue #114)", () => {
  it("start, step 3, close, start again: step 3", () => {
    const d = device();
    expect(d.api.startStep("a.md", 8)).toBe(0);
    d.api.note("a.md", 3, 8);
    // the view is closed here; a new start reads what was stored
    expect(d.api.startStep("a.md", 8)).toBe(3);
  });
  it("keeps recipes apart", () => {
    const d = device();
    d.api.note("a.md", 3, 8);
    expect(d.api.startStep("b.md", 8)).toBe(0);
  });
  it("forgets after the done view, so the next start is at step 1", () => {
    const d = device();
    d.api.note("a.md", 7, 8);
    d.api.note("a.md", 8, 8);
    expect(d.api.startStep("a.md", 8)).toBe(0);
    expect(d.stored()).toBeUndefined();
  });
  it("forgets when the user goes back to step 1", () => {
    const d = device();
    d.api.note("a.md", 2, 8);
    d.api.note("a.md", 0, 8);
    expect(d.api.startStep("a.md", 8)).toBe(0);
  });
  it("offers the step only within the window after the last change", () => {
    const d = device();
    d.api.note("a.md", 3, 8);
    d.advance(RESUME_MS);
    expect(d.api.startStep("a.md", 8)).toBe(3);
    d.advance(1);
    expect(d.api.startStep("a.md", 8)).toBe(0);
  });
});

describe("startStep", () => {
  const list: ResumeEntry[] = [{ path: "a.md", step: 5, at: 100 }];
  it("starts at the first step when the recipe got shorter than the stored step", () => {
    expect(startStep(list, "a.md", 200, 5)).toBe(0);
    expect(startStep(list, "a.md", 200, 3)).toBe(0);
    expect(startStep(list, "a.md", 200, 6)).toBe(5);
    expect(startStep(list, "a.md", 200, 0)).toBe(0);
  });
});

describe("storage", () => {
  const now = 10_000;
  it("keeps at most RESUME_MAX recipes and drops the oldest", () => {
    let list: ResumeEntry[] = [];
    for (let i = 0; i < RESUME_MAX + 5; i++) list = remember(list, `r${i}.md`, 1, 4, now + i);
    expect(list).toHaveLength(RESUME_MAX);
    expect(list.map((e) => e.path)).not.toContain("r0.md");
    expect(list[0].path).toBe(`r${RESUME_MAX + 4}.md`);
  });
  it("holds one entry per recipe", () => {
    const list = remember(remember([], "a.md", 1, 4, now), "a.md", 2, 4, now + 1);
    expect(list).toEqual([{ path: "a.md", step: 2, at: now + 1 }]);
  });
  it("drops broken and foreign data instead of failing", () => {
    for (const raw of [undefined, null, 5, "x", {}, { path: "a.md", step: 2, at: now }])
      expect(restoreResume(raw, now)).toEqual([]);
    const raw = [
      null,
      "x",
      { path: "ok.md", step: 2, at: now },
      { path: "", step: 2, at: now },
      { path: 3, step: 2, at: now },
      { path: "a.md", step: 0, at: now },
      { path: "b.md", step: 1.5, at: now },
      { path: "c.md", step: -1, at: now },
      { path: "d.md", step: 2, at: "now" },
      { path: "e.md", step: 2, at: NaN },
      { path: "f.md", step: 2, at: now - RESUME_MS - 1 },
      { path: "future.md", step: 2, at: now + RESUME_SKEW_MS + 1 },
      { path: "skew.md", step: 2, at: now + RESUME_SKEW_MS },
      { path: "__proto__", step: 2, at: now - 1 },
    ];
    expect(restoreResume(raw, now).map((e) => e.path)).toEqual(["skew.md", "ok.md", "__proto__"]);
  });
  it("prune sorts newest first and drops duplicates", () => {
    const l = prune(
      [
        { path: "a.md", step: 1, at: 1 },
        { path: "a.md", step: 2, at: 3 },
        { path: "b.md", step: 1, at: 2 },
      ],
      5,
    );
    expect(l).toEqual([
      { path: "a.md", step: 2, at: 3 },
      { path: "b.md", step: 1, at: 2 },
    ]);
  });
});

describe("forget (#119)", () => {
  it("drops the position of a deleted recipe and keeps the others", () => {
    let stored: unknown = [
      { path: "A.md", step: 2, at: 1_000_000 },
      { path: "B.md", step: 1, at: 1_000_000 },
    ];
    const r = createResume({ now: () => 1_000_000, load: () => stored, save: (v) => (stored = v) });
    r.forget("A.md");
    expect(stored).toEqual([{ path: "B.md", step: 1, at: 1_000_000 }]);
    r.forget("B.md");
    expect(stored).toBeNull();
  });
});
