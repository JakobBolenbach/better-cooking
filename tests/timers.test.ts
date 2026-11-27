import { describe, expect, it } from "vitest";
import {
  addMinute,
  cancelTimer,
  due,
  markRang,
  pauseTimer,
  remaining,
  restoreTimers,
  screenWanted,
  splitAgo,
  resumeTimer,
  sortTimers,
  startTimer,
  type Timer,
} from "../src/timers";

const T0 = 1_000_000;
const make = (list: Timer[], id: string, sec: number, now = T0) =>
  startTimer(list, { id, label: `Step ${id}`, recipePath: "Recipes/Soup.md" }, sec, now);

describe("timers", () => {
  it("starts with a wall clock end and counts down", () => {
    const l = make([], "a", 90);
    expect(l[0].endAt).toBe(T0 + 90_000);
    expect(remaining(l[0], T0 + 30_000)).toBe(60_000);
    expect(remaining(l[0], T0 + 200_000)).toBe(0);
  });

  it("is due only when it is over, running and not reported yet", () => {
    let l = make(make([], "a", 10), "b", 60);
    expect(due(l, T0 + 9_999)).toEqual([]);
    expect(due(l, T0 + 10_000).map((t) => t.id)).toEqual(["a"]);
    l = markRang(l, ["a"], T0 + 10_000);
    expect(due(l, T0 + 20_000)).toEqual([]);
    expect(due(l, T0 + 70_000).map((t) => t.id)).toEqual(["b"]);
  });

  it("pauses with the rest and resumes from the new time", () => {
    let l = make([], "a", 60);
    l = pauseTimer(l, "a", T0 + 20_000);
    expect(l[0].pausedLeft).toBe(40_000);
    expect(due(l, T0 + 999_999)).toEqual([]);
    expect(remaining(l[0], T0 + 500_000)).toBe(40_000);
    l = resumeTimer(l, "a", T0 + 100_000);
    expect(l[0].pausedLeft).toBeUndefined();
    expect(l[0].endAt).toBe(T0 + 140_000);
  });

  it("does not pause one that is over", () => {
    const l = markRang(make([], "a", 1), ["a"], T0 + 1000);
    expect(pauseTimer(l, "a", T0 + 2000)).toEqual(l);
  });

  it("adds one minute to a running, a paused and a finished timer", () => {
    const running = addMinute(make([], "a", 60), "a", T0);
    expect(running[0].endAt).toBe(T0 + 120_000);
    const paused = addMinute(pauseTimer(make([], "a", 60), "a", T0 + 10_000), "a", T0 + 10_000);
    expect(paused[0].pausedLeft).toBe(110_000);
    const over = markRang(make([], "a", 60), ["a"], T0 + 60_000);
    const again = addMinute(over, "a", T0 + 90_000);
    expect(again[0].rang).toBeUndefined();
    expect(again[0].endAt).toBe(T0 + 150_000);
    expect(due(again, T0 + 149_999)).toEqual([]);
    expect(due(again, T0 + 150_000)).toHaveLength(1);
  });

  it("cancels one timer", () => {
    expect(cancelTimer(make(make([], "a", 5), "b", 5), "a").map((t) => t.id)).toEqual(["b"]);
  });

  it("adds the minute to the end, but at least counted from now", () => {
    const l = make([], "a", 60);
    expect(addMinute(l, "a", T0 + 120_000)[0].endAt).toBe(T0 + 180_000);
  });

  it("splits a span into hours and minutes and decides about the screen", () => {
    expect(splitAgo(75 * 60_000 + 20_000)).toEqual({ h: 1, min: 15 });
    expect(splitAgo(-5)).toEqual({ h: 0, min: 0 });
    const running = make([], "a", 60);
    expect(screenWanted(running, true, false)).toBe(true);
    expect(screenWanted(running, false, false)).toBe(false);
    expect(screenWanted(markRang(running, ["a"], T0), true, false)).toBe(false);
    expect(screenWanted(markRang(running, ["a"], T0), true, true)).toBe(true);
    expect(screenWanted([], true, false)).toBe(false);
  });

  it("sorts over, then running by rest, then paused", () => {
    let l = make(make(make(make([], "slow", 300), "fast", 30), "stop", 100), "done", 5);
    l = pauseTimer(l, "stop", T0);
    l = markRang(l, ["done"], T0 + 5000);
    expect(sortTimers(l, T0 + 5000).map((t) => t.id)).toEqual(["done", "fast", "slow", "stop"]);
  });

  it("restores stored timers and drops damaged or ancient ones", () => {
    const ok = make([], "a", 60)[0];
    const old = { ...make([], "old", 1)[0], endAt: T0 - 13 * 3_600_000 };
    const stale = { ...ok, id: "paused", pausedLeft: 5000, endAt: 1 };
    const raw = [ok, old, stale, { id: 5 }, null, "x", { ...ok, id: "nan", endAt: "soon" }];
    expect(restoreTimers(raw, T0).map((t) => t.id)).toEqual(["a", "paused"]);
    expect(restoreTimers("nonsense", T0)).toEqual([]);
    expect(restoreTimers(JSON.parse(JSON.stringify([ok])), T0)).toEqual([ok]);
  });
});
