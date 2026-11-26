import { describe, expect, it } from "vitest";
import {
  AUTO_COMMAND,
  resolveSyncCommand,
  syncCandidates,
  syncDue,
  syncHintDue,
  syncWanted,
  SYNC_MIN_GAP_MS,
} from "../src/importSync";
import { WAIT_MIN } from "../src/processor";

const job = (o: object = {}) => ({ since: 1_000_000, processor: "claude" as const, ...o });
const MIN = 60_000;

describe("syncWanted", () => {
  it("is true for an open Git job within the time limit", () => {
    expect(syncWanted([job()], 1_000_000 + MIN)).toBe(true);
    expect(syncWanted([job({ processor: "github" })], 1_000_000)).toBe(true);
  });
  it("is false without jobs, for failed jobs and past the limit", () => {
    expect(syncWanted([], 5)).toBe(false);
    expect(syncWanted([job({ error: "x" })], 1_000_000)).toBe(false);
    expect(syncWanted([job({ errorKey: "noRecipeArrived" })], 1_000_000)).toBe(false);
    expect(syncWanted([job()], 1_000_000 + WAIT_MIN * MIN + 1)).toBe(false);
    expect(syncWanted([job()], 1_000_000 + WAIT_MIN * MIN)).toBe(true);
  });
  it("looks at all jobs", () => {
    expect(syncWanted([job({ error: "x" }), job()], 1_000_000)).toBe(true);
  });
});

describe("syncDue", () => {
  it("allows the first request and blocks a second one within the gap", () => {
    expect(syncDue(0, 100_000)).toBe(true);
    expect(syncDue(100_000, 100_000 + SYNC_MIN_GAP_MS - 1)).toBe(false);
    expect(syncDue(100_000, 100_000 + SYNC_MIN_GAP_MS)).toBe(true);
  });
  it("allows a request when the clock went back", () => {
    expect(syncDue(200_000, 100_000)).toBe(true);
  });
});

describe("resolveSyncCommand", () => {
  const all = [AUTO_COMMAND, "other:sync-now"];
  it("automatic needs Obsidian Git", () => {
    expect(resolveSyncCommand("auto", all)).toBe(AUTO_COMMAND);
    expect(resolveSyncCommand("auto", ["other:sync-now"])).toBeNull();
    expect(resolveSyncCommand("", all)).toBe(AUTO_COMMAND);
  });
  it("off runs nothing", () => {
    expect(resolveSyncCommand("off", all)).toBeNull();
  });
  it("a chosen command must exist", () => {
    expect(resolveSyncCommand("other:sync-now", all)).toBe("other:sync-now");
    expect(resolveSyncCommand("gone:sync", all)).toBeNull();
  });
});

describe("syncCandidates", () => {
  it("keeps commands with pull or sync in ID or name, sorted by name", () => {
    const c = [
      { id: "a:open", name: "Open" },
      { id: "obsidian-git:pull", name: "Obsidian Git: Pull" },
      { id: "x:y", name: "Sync now" },
      { id: "app:PULL-all", name: "Z" },
    ];
    expect(syncCandidates(c).map((x) => x.id)).toEqual(["obsidian-git:pull", "x:y", "app:PULL-all"]);
  });
});

describe("syncHintDue", () => {
  it("starts after three minutes", () => {
    expect(syncHintDue({ since: 0 }, 3 * MIN)).toBe(false);
    expect(syncHintDue({ since: 0 }, 3 * MIN + 1)).toBe(true);
  });
});
