import { describe, expect, it } from "vitest";
import {
  AUTO_GAP_MS,
  AUTO_MAX,
  autoEvery,
  afterRun,
  resolveSyncCommand,
  syncButtonJob,
  syncDecision,
  syncHintDue,
  syncOpen,
  type SyncInput,
} from "../src/importSync";
import { jobTimedOut, WAIT_MIN } from "../src/processor";

const MIN = 60_000;
const T0 = 10_000_000;
const CMD = "obsidian-git:pull";
const job = (o: object = {}) => ({ id: "rz-1", since: T0, processor: "claude" as const, device: "me", ...o });
const base = (o: Partial<SyncInput> = {}): SyncInput => ({
  trigger: "interval",
  jobs: [job()],
  device: "me",
  enabled: true,
  command: CMD,
  lastAt: 0,
  now: T0 + 2 * MIN,
  counts: {},
  online: true,
  arrived: () => new Set(),
  ...o,
});
const reason = (o: Partial<SyncInput>) => {
  const d = syncDecision(base(o));
  return d.run ? "run" : d.reason;
};

describe("resolveSyncCommand", () => {
  it("only commands from the list, and only if they exist", () => {
    expect(resolveSyncCommand([CMD, "x:sync"])).toBe(CMD);
    expect(resolveSyncCommand(["x:sync", "y:pull"])).toBeNull();
    expect(resolveSyncCommand([])).toBeNull();
  });
});

describe("jobTimedOut and syncOpen", () => {
  it("counts a job as open until WAIT_MIN", () => {
    expect(jobTimedOut({ since: 0 }, WAIT_MIN * MIN)).toBe(false);
    expect(jobTimedOut({ since: 0 }, WAIT_MIN * MIN + 1)).toBe(true);
    expect(syncOpen(job(), T0 + WAIT_MIN * MIN)).toBe(true);
    expect(syncOpen(job(), T0 + WAIT_MIN * MIN + 1)).toBe(false);
  });
  it("is false for failed jobs", () => {
    expect(syncOpen(job({ error: "x" }), T0)).toBe(false);
    expect(syncOpen(job({ errorKey: "noRecipeArrived" }), T0)).toBe(false);
  });
});

describe("syncDecision, automatic", () => {
  it("runs for an own job after the start phase", () => {
    expect(syncDecision(base())).toEqual({ run: true, command: CMD, jobs: ["rz-1"] });
  });
  it("not in the first 90 seconds", () => {
    expect(reason({ now: T0 + 89_000 })).toBe("too-early");
    expect(reason({ now: T0 + 90_000 })).toBe("run");
  });
  it("paces by job age: 30 s until 6 min, 60 s after", () => {
    expect(autoEvery(5 * MIN)).toBe(30_000);
    expect(autoEvery(6 * MIN)).toBe(60_000);
    expect(reason({ now: T0 + 3 * MIN, lastAt: T0 + 3 * MIN - 24_000 })).toBe("lock");
    expect(reason({ now: T0 + 3 * MIN, lastAt: T0 + 3 * MIN - 26_000 })).toBe("too-early");
    expect(reason({ now: T0 + 3 * MIN, lastAt: T0 + 3 * MIN - 30_000 })).toBe("run");
    expect(reason({ now: T0 + 7 * MIN, lastAt: T0 + 7 * MIN - 40_000 })).toBe("too-early");
    expect(reason({ now: T0 + 7 * MIN, lastAt: T0 + 7 * MIN - 60_000 })).toBe("run");
  });
  it("keeps the gap of 25 s after any sync", () => {
    expect(reason({ lastAt: T0 + 2 * MIN - AUTO_GAP_MS + 1 })).toBe("lock");
  });
  it("never for a job of another device, or without a device", () => {
    expect(reason({ device: "other" })).toBe("no-job");
    expect(reason({ jobs: [job({ device: undefined })] })).toBe("no-job");
    expect(reason({ device: null })).toBe("no-job");
  });
  it("not for a job whose note arrived", () => {
    expect(reason({ arrived: () => new Set(["rz-1"]) })).toBe("no-job");
  });
  it("stops at the upper limit", () => {
    expect(reason({ counts: { "rz-1": AUTO_MAX - 1 } })).toBe("run");
    expect(reason({ counts: { "rz-1": AUTO_MAX } })).toBe("limit");
  });
  it("not when off, without the command, after the time limit or for failed jobs", () => {
    expect(reason({ enabled: false })).toBe("off");
    expect(reason({ command: null })).toBe("unavailable");
    expect(reason({ now: T0 + WAIT_MIN * MIN + 1 })).toBe("no-job");
    expect(reason({ jobs: [job({ error: "x" })] })).toBe("no-job");
    expect(reason({ jobs: [] })).toBe("no-job");
  });
  it("returns to the foreground from 60 s, with the same gap", () => {
    expect(reason({ trigger: "foreground", now: T0 + 59_000 })).toBe("too-early");
    expect(reason({ trigger: "foreground", now: T0 + 60_000 })).toBe("run");
    expect(reason({ trigger: "foreground", lastAt: T0 + 2 * MIN - 10_000 })).toBe("lock");
  });
  it("only the due jobs are counted", () => {
    const d = syncDecision(base({ jobs: [job(), job({ id: "rz-2", since: T0 + 2 * MIN - 10_000 })] }));
    expect(d).toEqual({ run: true, command: CMD, jobs: ["rz-1"] });
  });
});

describe("syncDecision, button", () => {
  const manual = (o: Partial<SyncInput> = {}) => reason({ trigger: "manual", ...o });
  it("works for every open job, also of another device and at once", () => {
    expect(manual({ device: "other", now: T0 + 5_000 })).toBe("run");
    expect(manual({ jobs: [job({ device: undefined })], arrived: () => new Set(["rz-1"]) })).toBe("run");
  });
  it("has its own short lock of 5 s", () => {
    expect(manual({ lastAt: T0 + 2 * MIN - 4_000 })).toBe("lock");
    expect(manual({ lastAt: T0 + 2 * MIN - 5_000 })).toBe("run");
  });
  it("needs the setting, the command and an open job", () => {
    expect(manual({ enabled: false })).toBe("off");
    expect(manual({ command: null })).toBe("unavailable");
    expect(manual({ jobs: [] })).toBe("no-job");
  });
});

describe("syncDecision, cheap checks first", () => {
  it("does not ask for arrived jobs when something cheaper stops the sync", () => {
    let asked = 0;
    const arrived = () => {
      asked++;
      return new Set<string>();
    };
    for (const o of [
      { enabled: false },
      { command: null },
      { online: false },
      { device: "other" },
      { lastAt: T0 + 2 * MIN - 1000 },
      { jobs: [] },
    ])
      syncDecision(base({ ...o, arrived }));
    expect(asked).toBe(0);
    syncDecision(base({ arrived }));
    expect(asked).toBe(1);
  });
  it("offline: no automatic sync", () => {
    expect(reason({ online: false })).toBe("offline");
  });
  it("AUTO_MAX covers the pace up to the time limit", () => {
    expect(AUTO_MAX).toBe(23);
  });
});

describe("afterRun", () => {
  const state = { lastAt: 5, counts: { "rz-1": 2 } };
  const auto = { run: true as const, command: CMD, jobs: ["rz-1", "rz-2"] };
  it("sets lock and counters only if the command ran", () => {
    expect(afterRun(state, auto, false, 99)).toBe(state);
    expect(afterRun(state, auto, true, 99)).toEqual({ lastAt: 99, counts: { "rz-1": 3, "rz-2": 1 } });
  });
  it("the button sets the lock but counts no job", () => {
    expect(afterRun(state, { run: true, command: CMD, jobs: [] }, true, 99)).toEqual({
      lastAt: 99,
      counts: state.counts,
    });
  });
  it("a refused decision changes nothing", () => {
    expect(afterRun(state, { run: false, reason: "lock" }, true, 99)).toBe(state);
  });
  it("does not change the old state object", () => {
    afterRun(state, auto, true, 99);
    expect(state.counts).toEqual({ "rz-1": 2 });
  });
});

describe("hint and button placement", () => {
  it("hint starts after three minutes", () => {
    expect(syncHintDue({ since: 0 }, 3 * MIN)).toBe(false);
    expect(syncHintDue({ since: 0 }, 3 * MIN + 1)).toBe(true);
  });
  it("the button sits on the first open job only", () => {
    const jobs = [job({ id: "a", error: "x" }), job({ id: "b" }), job({ id: "c" })];
    expect(syncButtonJob(jobs, T0)).toBe("b");
    expect(syncButtonJob([], T0)).toBeUndefined();
  });
});
