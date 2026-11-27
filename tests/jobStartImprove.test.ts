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
import { retryImprove, withJob } from "../src/processor";
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

  it("passes on the job ID, the flag and the hint of the old job", () => {
    expect(retryImprove(old)).toEqual({ id: "rz-k3j9x-abc1", feedback: "mehr Salz" });
    expect(retryImprove({ ...old, feedback: undefined })).toEqual({ id: "rz-k3j9x-abc1" });
    expect(retryImprove({ ...old, improve: undefined })).toBeUndefined();
  });

  it("replaces the old job under the same ID instead of adding a second one", async () => {
    const r = await startJob(target, e, old.input, retryImprove(old));
    if (!r.ok) throw new Error("start");
    const jobs = withJob([old, { ...old, id: "rz-k3j9x-zzz9" }], r.job);
    expect(jobs.map((j) => j.id)).toEqual(["rz-k3j9x-zzz9", "rz-k3j9x-abc1"]);
    expect(jobs[1]).toMatchObject({ improve: true, feedback: "mehr Salz" });
    expect(jobs[1]).not.toHaveProperty("errorKey");
  });

  it("a normal retry still gets a new ID and the old job goes through replaceJob", () => {
    const normal = { ...old, improve: undefined, id: "rz-k3j9x-aaaa" };
    const next = { ...normal, id: "rz-k3j9x-bbbb" };
    expect(replaceJob(withJob([normal], next), normal, next.id).map((j) => j.id)).toEqual(["rz-k3j9x-bbbb"]);
  });
});
