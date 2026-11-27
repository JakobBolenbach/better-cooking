// Improvement jobs (ADR 0007): the requests, and which notes close such a job.
import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { detectSource, keyOf } from "../src/source";
import {
  FOREIGN_KEEP_MS,
  WAIT_MIN,
  checkJobs,
  evaluateResponse,
  githubRequest,
  jobText,
  newJob,
  settleJobs,
  visibleJobs,
} from "../src/processor";
import { DEFAULT_FORMAT, FIELD_PRESETS, importStateFrom, importValue, makeNoteFormat } from "../src/noteFormat";
import { syncOpen } from "../src/importSync";
import type { Job } from "../src/types";

beforeEach(() => setLanguage("de"));

const e = detectSource("https://www.instagram.com/reel/BcExample01/");
const a = { id: "rz-1", input: e.url! };

describe("requests of an improvement job", () => {
  it("send verbessern only when the job asks for it", () => {
    expect(JSON.parse(jobText(a, e))).not.toHaveProperty("verbessern");
    expect(JSON.parse(jobText({ ...a, improve: true }, e))).toMatchObject({ rezept_auftrag: "rz-1", verbessern: true });
    const plain = JSON.parse(githubRequest("o/v", "t", a, e).body) as { inputs: Record<string, string> };
    expect(plain.inputs).not.toHaveProperty("verbessern");
    const improve = JSON.parse(githubRequest("o/v", "t", { ...a, improve: true }, e).body) as {
      inputs: Record<string, string>;
    };
    expect(improve.inputs).toEqual({ auftrag: "rz-1", quelle: e.url, text: "", verbessern: "true" });
  });
  it("remember the improvement and the hint on the job", () => {
    expect(newJob(a, e, "claude", "d1", undefined, 5)).not.toHaveProperty("improve");
    expect(newJob({ ...a, improve: true, feedback: "mehr Salz" }, e, "github", "d1", undefined, 5)).toMatchObject({
      id: "rz-1",
      improve: true,
      feedback: "mehr Salz",
    });
  });
  it("turn a 422 about unexpected inputs into a hint about the 0.9 contract", () => {
    const r = evaluateResponse("github", 422, { message: 'Unexpected inputs provided: ["verbessern"]' });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.message).toContain("Vertrag 0.9");
    const other = evaluateResponse("github", 422, { message: "Validation Failed" });
    expect(other.ok === false && other.message).toContain("Workflow-Eingaben");
    expect(evaluateResponse("claude", 422, { message: "Unexpected inputs" })).toMatchObject({ ok: false });
  });
});

const job = (o: Partial<Job> = {}): Job => ({
  id: "rz-1",
  input: e.url!,
  kind: "instagram",
  key: e.key,
  since: 1_000_000,
  processor: "claude",
  device: "d1",
  improve: true,
  ...o,
});
const note = (o: object = {}) => ({
  path: "R/Reel.md",
  job: "rz-1",
  source: e.url,
  modified: 2_000_000,
  importState: "offen",
  ...o,
});
const proposal = (o: object = {}) => ({ path: "R/Verbesserungen/rz-1.md", job: "rz-1", modified: 3_000_000, ...o });
const NOW = 1_000_000 + 60_000;
const check = (jobs: Job[], recipes: object[], proposals: object[] = [], now = NOW) =>
  checkJobs(jobs, recipes as never, keyOf, now, proposals);

describe("checkJobs for an improvement job", () => {
  it("is not closed by its own 'offen' note", () => {
    const r = check([job()], [note()]);
    expect(r.done).toEqual([]);
    expect(r.pending).toEqual([job()]);
  });
  it("is not closed by a newer note with the same source or the same job ID, whatever its state", () => {
    expect(check([job()], [note({ importState: "fertig", modified: 9_000_000 })]).done).toEqual([]);
    expect(check([job()], [note({ path: "R/Zweit.md", job: undefined, modified: 9_000_000 })]).done).toEqual([]);
  });
  it("is not closed by a failure note either: the failure comes as a proposal", () => {
    const r = check([job()], [note({ importState: "fehler" })]);
    expect(r.failed).toEqual([]);
    expect(r.pending[0].errorKey).toBeUndefined();
  });
  it("is closed by its proposal", () => {
    const p = proposal();
    const r = check([job()], [note()], [p]);
    expect(r.done).toEqual([{ job: job(), recipe: p }]);
    expect(r.pending).toEqual([]);
  });
  it("is closed by a proposal that says 'failed', too", () => {
    expect(check([job()], [note()], [proposal({ importState: "fehler" })]).done).toHaveLength(1);
  });
  it("ignores the proposal of another job", () => {
    expect(check([job()], [note()], [proposal({ job: "rz-2" })]).done).toEqual([]);
  });
  it("does not let a proposal close a normal job", () => {
    expect(check([job({ improve: undefined })], [], [proposal()]).done).toEqual([]);
    expect(check([job({ improve: undefined })], [note({ importState: "fertig" })]).done).toHaveLength(1);
  });
  it("times out with its own hint, the first version stays", () => {
    const r = check([job()], [note()], [], 1_000_000 + (WAIT_MIN + 1) * 60_000);
    expect(r.pending[0].errorKey).toBe("noImprovementArrived");
  });
});

describe("settleJobs and visibleJobs for improvement jobs", () => {
  const settle = (device: string | null, now = NOW) => {
    const jobs = [job()];
    return settleJobs(jobs, check(jobs, [note()], [proposal()], now), device, now);
  };
  it("never announce a recipe that arrived, and keep the job for the service (starting device)", () => {
    const s = settle("d1");
    expect(s.announce).toEqual([]);
    expect(s.pending).toEqual([job()]);
  });
  it("keep it on another device too, but only for a while", () => {
    expect(settle("d2").pending).toEqual([job()]);
    expect(settle("d2", 1_000_000 + WAIT_MIN * 60_000 + FOREIGN_KEEP_MS + 1).pending).toEqual([]);
  });
  it("hide the job from the cards once its proposal is there, on every device", () => {
    const visible = (device: string) => visibleJobs([job()], [note()] as never, keyOf, device, NOW, [proposal()]);
    expect(visible("d1")).toEqual([]);
    expect(visible("d2")).toEqual([]);
    expect(visibleJobs([job()], [note()] as never, keyOf, "d1", NOW, [])).toEqual([job()]);
  });
});

describe("a dropped improvement job (the note was deleted)", () => {
  it("is not shown on any device and the sync does not wait for it", () => {
    const dropped = job({ dropped: true });
    expect(visibleJobs([dropped], [], keyOf, "d1", NOW, [])).toEqual([]);
    expect(visibleJobs([dropped], [], keyOf, "d2", NOW, [])).toEqual([]);
    expect(syncOpen(dropped, NOW)).toBe(false);
    // A job that keeps a review for the user has no card and nothing to sync either.
    const review = job({ review: { proposal: "P.md", target: "N.md" } });
    expect(visibleJobs([review], [], keyOf, "d1", NOW, [])).toEqual([]);
    expect(syncOpen(review, NOW)).toBe(false);
    expect(syncOpen(job(), NOW)).toBe(true);
  });
});

describe("import state 'offen'", () => {
  it("is written and read in both languages", () => {
    expect(importValue(DEFAULT_FORMAT, "offen")).toBe("offen");
    expect(importValue(makeNoteFormat("en").format, "offen")).toBe("open");
    expect(importStateFrom("open")).toBe("offen");
    expect(importStateFrom("Offen")).toBe("offen");
    expect(FIELD_PRESETS.en.importState).toBe("import");
  });
});
