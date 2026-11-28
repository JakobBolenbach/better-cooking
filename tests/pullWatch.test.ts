import { describe, expect, it } from "vitest";
import { PullWatch, type PullDeps } from "../src/pullWatch";
import { MANUAL_GAP_MS, SYNC_POLL_MS, SYNC_WAIT_MS, type SyncPhase } from "../src/importSync";

/** A clock that only sleep moves, and deps the tests can steer. */
function setup(o: Partial<PullDeps> & { jobs?: string[] } = {}) {
  let t = 1_000_000;
  const log = { pulls: 0, asked: 0 };
  const note = { ids: new Set<string>() };
  const deps: PullDeps = {
    watched: () => o.jobs ?? ["a"],
    attempt: () => (log.pulls++, { ran: true }),
    arrived: () => (log.asked++, note.ids),
    lockSeconds: () => 3,
    now: () => t,
    sleep: async (ms) => void (t += ms),
    ...o,
  };
  return { w: new PullWatch(deps), log, note, tick: (ms: number) => (t += ms), clock: () => t };
}

describe("PullWatch", () => {
  it("pulls, shows 'pulling' for the window, then 'waiting', and ends with the note", async () => {
    let polls = 0;
    const s = setup({ arrived: () => (++polls >= 8 ? new Set(["a"]) : new Set()) });
    const phases: SyncPhase[] = [];
    expect(await s.w.press((p) => phases.push(p))).toEqual({ ran: true, found: ["a"] });
    expect(phases).toEqual(["pulling", "waiting"]);
    expect(s.log.pulls).toBe(1);
    expect(s.w.pulling).toBe(false);
  });

  it("ends at once when the note is there, without waiting for the window", async () => {
    const s = setup();
    s.note.ids = new Set(["a"]);
    const phases: SyncPhase[] = [];
    expect(await s.w.press((p) => phases.push(p))).toEqual({ ran: true, found: ["a"] });
    expect(phases).toEqual(["pulling"]);
    expect(s.clock()).toBe(1_000_000 + SYNC_POLL_MS);
  });

  it("ignores notes of jobs that are not watched, and gives up after SYNC_WAIT_MS", async () => {
    const s = setup();
    s.note.ids = new Set(["other"]);
    expect(await s.w.press()).toEqual({ ran: true, found: [] });
    expect(s.clock() - 1_000_000).toBeGreaterThanOrEqual(SYNC_WAIT_MS);
    expect(s.clock() - 1_000_000).toBeLessThan(SYNC_WAIT_MS + SYNC_POLL_MS);
  });

  it("a press within the window joins the watch without a second pull", async () => {
    const s = setup();
    const first = s.w.press();
    const second = s.w.press();
    expect(s.log.pulls).toBe(1);
    expect(await second).toBe(await first);
  });

  it("pulls again after the window and starts 'pulling' again", async () => {
    // Manual clock: nothing moves except what the test does.
    let t = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const s = setup({
      now: () => t,
      sleep: async (ms) => {
        if (first) {
          first = false;
          await gate;
        }
        t += ms;
      },
    });
    const phases: SyncPhase[] = [];
    const a = s.w.press();
    t += MANUAL_GAP_MS + 1; // the window is over, the watch has not looked yet
    const b = s.w.press((p) => phases.push(p));
    expect(s.log.pulls).toBe(2);
    expect(phases).toEqual(["pulling"]);
    release();
    s.note.ids = new Set(["a"]);
    expect(await b).toEqual({ ran: true, found: ["a"] });
    expect(await a).toEqual({ ran: true, found: ["a"] });
  });

  it("is not pulling after success and after an error", async () => {
    const ok = setup();
    ok.note.ids = new Set(["a"]);
    const p = ok.w.press();
    expect(ok.w.pulling).toBe(true);
    await p;
    expect(ok.w.pulling).toBe(false);
    const bad = setup({
      arrived: () => {
        throw new Error("cache gone");
      },
    });
    await expect(bad.w.press()).rejects.toThrow("cache gone");
    expect(bad.w.pulling).toBe(false);
  });

  it("rejects when asking for the open jobs fails, without a pull", async () => {
    const s = setup({
      watched: () => {
        throw new Error("boom");
      },
    });
    await expect(s.w.press()).rejects.toThrow("boom");
    expect(s.log.pulls).toBe(0);
  });

  it("nothing to wait for: back at once, no pull", async () => {
    const s = setup({ jobs: [] });
    expect(await s.w.press()).toEqual({ ran: false, already: true, found: [] });
    expect(s.log.pulls).toBe(0);
    expect(s.w.pulling).toBe(false);
  });

  it("a locked pull without a watch says when to try again", async () => {
    const s = setup({ attempt: () => ({ ran: false, reason: "lock" }) });
    expect(await s.w.press()).toEqual({ ran: false, reason: "lock", retryIn: 3, found: [] });
  });

  it("other reasons carry no retry time", async () => {
    const s = setup({ attempt: () => ({ ran: false, reason: "offline" }) });
    expect(await s.w.press()).toEqual({ ran: false, reason: "offline", found: [] });
  });

  it("a locked pull while a watch runs joins that watch", async () => {
    let t = 0;
    let n = 0;
    const s = setup({
      now: () => t,
      attempt: () => (n++ === 0 ? { ran: true } : { ran: false, reason: "lock" }),
      sleep: async (ms) => void (t += ms),
    });
    const a = s.w.press();
    t += MANUAL_GAP_MS + 1;
    const b = s.w.press();
    s.note.ids = new Set(["a"]);
    expect(await b).toEqual({ ran: true, found: ["a"] });
    expect(await a).toEqual({ ran: true, found: ["a"] });
  });

  it("stops watching when aborted", async () => {
    const ctrl = new AbortController();
    const s = setup({
      signal: ctrl.signal,
      sleep: async () => {
        ctrl.abort();
      },
    });
    expect(await s.w.press()).toEqual({ ran: true, found: [] });
    expect(s.log.asked).toBe(0);
    expect(s.w.pulling).toBe(false);
  });
});
