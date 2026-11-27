// Starting and retrying an improvement job (ADR 0007): the job ID of the note, `improve` and the hint stay.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { url: string; body: string }[] = [];
vi.mock("obsidian", () => ({
  requestUrl: async (r: { url: string; body: string }) => {
    sent.push(r);
    return { status: 204, json: null };
  },
}));

import { startJob } from "../src/jobStart";
import { retryImprove } from "../src/processor";
import { replacedRun } from "../src/improve";
import { replaceJob } from "../src/importFailure";
import { setLanguage } from "../src/i18n";
import { detectSource } from "../src/source";

const e = detectSource("https://www.instagram.com/reel/BcExample01/");
const target = { processor: "github" as const, routine: "", repo: "o/v", token: "t", device: "d1" };

beforeEach(() => {
  sent.length = 0;
  setLanguage("de");
});

describe("startJob with improve", () => {
  it("keeps the job ID of the note, marks the job and asks the processor to improve", async () => {
    const r = await startJob(target, e, e.url!, { id: "rz-k3j9x-abc1", feedback: "mehr Salz" });
    expect(r.ok && r.job).toMatchObject({ id: "rz-k3j9x-abc1", improve: true, feedback: "mehr Salz", device: "d1" });
    const body = JSON.parse(sent[0].body) as { inputs: Record<string, string> };
    expect(body.inputs).toMatchObject({ auftrag: "rz-k3j9x-abc1", verbessern: "true" });
  });

  it("is a normal job without it: a new ID and no flag", async () => {
    const r = await startJob(target, e, e.url!);
    expect(r.ok && r.job.id).toMatch(/^rz-[0-9a-z]+-[0-9a-z]{4}$/);
    expect(r.ok && r.job).not.toHaveProperty("improve");
    expect(JSON.parse(sent[0].body)).not.toHaveProperty("inputs.verbessern");
  });

  it("goes the same way for Claude: verbessern in the job text", async () => {
    const claude = { ...target, processor: "claude" as const, routine: "trig_0123456789abc" };
    await startJob(claude, e, e.url!, { id: "rz-k3j9x-abc1" });
    const text = (JSON.parse(sent[0].body) as { text: string }).text;
    expect(JSON.parse(text)).toMatchObject({ rezept_auftrag: "rz-k3j9x-abc1", verbessern: true });
  });
});

describe("retrying an improvement job", () => {
  const old = {
    id: "rz-k3j9x-abc1",
    improve: true as const,
    feedback: "mehr Salz",
    input: "x",
    kind: "instagram",
    since: 1,
    processor: "github" as const,
    errorKey: "noImprovementArrived" as const,
  };

  it("passes on the flag and the hint, not the ID", () => {
    expect(retryImprove(old)).toEqual({ feedback: "mehr Salz" });
    expect(retryImprove({ ...old, feedback: undefined })).toEqual({});
    expect(retryImprove({ ...old, improve: undefined })).toBeUndefined();
  });

  it("starts a run with a NEW job ID that is an improvement job with the same hint, and remembers the old run", async () => {
    const r = await startJob(target, e, old.input, retryImprove(old));
    if (!r.ok) throw new Error("start");
    expect(r.job.id).not.toBe(old.id);
    expect(r.job).toMatchObject({ improve: true, feedback: "mehr Salz" });
    const jobs = replaceJob([old, r.job], old, r.job.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].retryOf).toEqual([{ job: old.id, note: undefined }]);
    expect(replacedRun(jobs, old.id)).toBe(true);
    const body = JSON.parse(sent[0].body) as { inputs: Record<string, string> };
    expect(body.inputs).toMatchObject({ auftrag: r.job.id, verbessern: "true" });
  });

  it("a normal retry is unchanged", () => {
    expect(retryImprove({ ...old, improve: undefined })).toBeUndefined();
  });
});
