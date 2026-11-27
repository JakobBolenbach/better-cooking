// "Retry" of a job that went to the processor after the plugin could not read the post (#156): the reason goes along.
import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { retryJob } from "../src/jobRetry";
import type { Job } from "../src/types";

describe("retryJob", () => {
  it("hands the reason of the failed local reading to the new job, which keeps it", async () => {
    const old: Job = {
      id: "rz-1",
      input: "https://www.instagram.com/p/A/",
      kind: "instagram",
      since: 1,
      processor: "claude",
      errorKey: "noRecipeArrived",
      local: { why: "unreadable", instant: true },
    };
    const sendJob = vi.fn(async () => ({ ok: true, job: "rz-2" }));
    const p = {
      // The new job is accepted without `local` (as `sendJob` of a plain job would store it): the old one's goes along.
      settings: {
        jobs: [old, { id: "rz-2", input: old.input, kind: "instagram", since: 2, processor: "claude" }] as Job[],
      },
      processorInfo: () => ({ ready: { claude: true, github: false } }),
      sendJob,
      save: vi.fn(async (s: { jobs?: Job[] }) => void Object.assign(p.settings, s)),
    };
    await retryJob(p as never, "rz-1");
    expect(sendJob).toHaveBeenCalledWith(expect.anything(), old.input, "claude", old.local);
    expect(p.settings.jobs.map((j) => j.id)).toEqual(["rz-2"]);
    expect(sendJob.mock.calls[0]).toHaveLength(4);
    expect(p.settings.jobs[0].retryOf).toEqual([{ job: "rz-1", note: undefined }]);
  });
});
