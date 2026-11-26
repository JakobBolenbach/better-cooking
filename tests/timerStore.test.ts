import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerStore } from "../src/timerStore";
import type { Timer } from "../src/timers";

let stored: unknown;
const onDue = vi.fn();
const onStart = vi.fn();
const make = () =>
  new TimerStore({
    now: () => Date.now(),
    load: () => stored,
    save: (l) => (stored = JSON.parse(JSON.stringify(l))),
    setTimer: (f, ms) => setTimeout(f, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onStart,
    onDue,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  stored = undefined;
  onDue.mockReset();
  onStart.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("timer store", () => {
  it("starts a timer, saves it and reports it once when it ends, with a single timeout", () => {
    const s = make();
    s.start("Boil", "R/Soup.md", 90);
    expect(onStart).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    expect((stored as Timer[])[0].label).toBe("Boil");
    vi.advanceTimersByTime(89_000);
    expect(onDue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onDue).toHaveBeenCalledOnce();
    expect(onDue.mock.calls[0][0][0].label).toBe("Boil");
    expect(s.get()[0].rang).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
    s.check();
    expect(onDue).toHaveBeenCalledOnce();
  });

  it("pause and resume move the timeout", () => {
    const s = make();
    s.start("a", "p", 60);
    vi.advanceTimersByTime(20_000);
    s.pause(s.get()[0].id);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(600_000);
    expect(onDue).not.toHaveBeenCalled();
    s.resume(s.get()[0].id);
    vi.advanceTimersByTime(39_999);
    expect(onDue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDue).toHaveBeenCalledOnce();
  });

  it("+1 minute on a ringing timer makes it run again; stop removes it", () => {
    const s = make();
    s.start("a", "p", 5);
    vi.advanceTimersByTime(5000);
    const id = s.get()[0].id;
    s.addMinute(id);
    expect(s.get()[0].rang).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(onDue).toHaveBeenCalledTimes(2);
    s.stop(id);
    expect(s.get()).toEqual([]);
    expect((stored as Timer[]).length).toBe(0);
  });

  it("reports timers that ended while nobody looked (late), also after a restart", () => {
    const first = make();
    first.start("a", "p", 60);
    first.dispose();
    vi.setSystemTime(1_000_000 + 5 * 60_000);
    const second = make();
    expect(second.get()).toHaveLength(1);
    second.check();
    expect(onDue).toHaveBeenCalledOnce();
    expect(onDue.mock.calls[0][1]).toBe(4 * 60_000);
  });

  it("tells listeners about changes and lets them go", () => {
    const s = make();
    const l = vi.fn();
    const off = s.subscribe(l);
    s.start("a", "p", 60);
    expect(l).toHaveBeenCalledOnce();
    off();
    s.stop(s.get()[0].id);
    expect(l).toHaveBeenCalledOnce();
  });
});
