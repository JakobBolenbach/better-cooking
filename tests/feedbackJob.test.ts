// The note's side of a feedback job (issue #120, ADR 0007): offen with the new job ID, and back again.
import { describe, expect, it } from "vitest";
import { bindJob, stateOf, unbindJob } from "../src/feedbackJob";
import { improvementBusy, markImproveFailed, prevOf, rebindJob } from "../src/improve";
import { withNewRun } from "../src/jobRetry";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { parseRecipe } from "../src/parse";
import { recipeNote } from "../src/recipeNote";
import type { Job } from "../src/types";

const f = DEFAULT_FORMAT;
const done = recipeNote(
  { title: "Biskuit", ingredients: ["4 Eier"], steps: [{ text: "Backen." }], images: [] },
  { source: "https://example.org/b", today: "2026-11-01", format: f },
);
const partial = done
  .replace(/import: \w+/, "import: teilweise")
  .replace(/import_fehler:.*/, "import_fehler: Mengen fehlen");
const read = (t: string) => parseRecipe("x", t, 0, f.fields);
const withId = (t: string, id: string) => t.replace("typ: rezept", `typ: rezept\nauftrag: ${id}`);

describe("bindJob", () => {
  it("sets the job ID and 'offen' and says what the note was", () => {
    const b = bindJob(partial, f, undefined, "rz-new-0001")!;
    expect(read(b.text)).toMatchObject({ job: "rz-new-0001", importState: "offen" });
    expect(read(b.text).importError ?? "").toBe("");
    expect(b.prev).toEqual({ state: "teilweise", error: "Mengen fehlen" });
  });
  it("keeps nothing to put back for a note that is 'offen' already", () => {
    const open = withId(done.replace(/import: \w+/, "import: offen"), "rz-old-0001");
    const b = bindJob(open, f, "rz-old-0001", "rz-new-0002")!;
    expect(read(b.text)).toMatchObject({ job: "rz-new-0002", importState: "offen" });
    expect(b.prev).toBeUndefined();
  });
  it("is a compare-and-set on the job ID", () => {
    expect(bindJob(withId(done, "rz-old-0001"), f, "rz-other-0003", "rz-new-0002")).toBeNull();
    expect(bindJob(withId(done, "rz-old-0001"), f, undefined, "rz-new-0002")).toBeNull();
    expect(bindJob(done, f, "rz-old-0001", "rz-new-0002")).toBeNull();
    expect(bindJob("# Nur Text", f, undefined, "rz-new-0002")).toBeNull();
  });
  it("reads the state in either language and a note without the field as finished", () => {
    expect(stateOf(partial.replace("import: teilweise", "import: partial"), makeNoteFormat("en").format).state).toBe(
      "teilweise",
    );
    expect(stateOf(done.replace(/import: .*\n/, ""), f)).toEqual({ state: "fertig" });
  });
});

describe("unbindJob and the restore on failure", () => {
  const sent = () => bindJob(withId(partial, "rz-old-0001"), f, "rz-old-0001", "rz-new-0002")!;
  it("puts the old job ID, state and reason back after a clear refusal", () => {
    const b = sent();
    const back = unbindJob(b.text, f, "rz-new-0002", "rz-old-0001", b.prev)!;
    expect(read(back)).toMatchObject({ job: "rz-old-0001", importState: "teilweise", importError: "Mengen fehlen" });
  });
  it("removes the job ID when the note had none", () => {
    const b = bindJob(partial, f, undefined, "rz-new-0002")!;
    const back = unbindJob(b.text, f, "rz-new-0002", undefined, b.prev)!;
    expect(read(back).job).toBeUndefined();
    expect(back).not.toContain("auftrag");
    expect(read(back).importState).toBe("teilweise");
  });
  it("does nothing if the note changed since", () => {
    const b = sent();
    expect(unbindJob(b.text.replace("offen", "fertig"), f, "rz-new-0002", "rz-old-0001", b.prev)).toBeNull();
    expect(
      unbindJob(rebindJob(b.text, f, "rz-new-0002", "rz-x-0009")!, f, "rz-new-0002", "rz-old-0001", b.prev),
    ).toBeNull();
  });
  it("a failure, timeout or discard writes the old state back instead of 'teilweise'", () => {
    const b = sent();
    const failed = markImproveFailed(b.text, "rz-new-0002", "Nichts angekommen", f, b.prev)!;
    expect(read(failed)).toMatchObject({ importState: "teilweise", importError: "Mengen fehlen", job: "rz-new-0002" });
    const fine = bindJob(done, f, undefined, "rz-n-0003")!;
    const back = markImproveFailed(fine.text, "rz-n-0003", "Nichts angekommen", f, fine.prev)!;
    expect(read(back).importState).toBe("fertig");
    expect(read(back).importError ?? "").toBe("");
    // a first version has nothing to go back to
    const first = markImproveFailed(b.text, "rz-new-0002", "Nichts angekommen", f)!;
    expect(read(first).importError).toBe("Nichts angekommen");
    // only while the note still waits
    expect(markImproveFailed(done, "rz-n-0003", "x", f, fine.prev)).toBeNull();
  });
});

const job = (o: Partial<Job> = {}): Job => ({
  id: "rz-a-0001",
  input: "https://example.org/b",
  kind: "webseite",
  since: 1,
  processor: "claude",
  improve: true,
  ...o,
});

describe("improvementBusy", () => {
  const note = { path: "R/A.md", job: "rz-a-0001" };
  it("is 'running' for an open improvement job of the note", () => {
    expect(improvementBusy([job()], note)).toBe("running");
  });
  it("is 'review' while a proposal waits on the note", () => {
    expect(improvementBusy([job({ review: { proposal: "R/V/rz-a-0001.md", target: "R/A.md" } })], note)).toBe("review");
  });
  it("is free for a failed, timed out or dropped job, a normal job and other notes", () => {
    expect(improvementBusy([job({ errorKey: "noImprovementArrived" })], note)).toBeUndefined();
    expect(improvementBusy([job({ error: "x" })], note)).toBeUndefined();
    expect(improvementBusy([job({ dropped: true })], note)).toBeUndefined();
    expect(improvementBusy([job({ improve: undefined })], note)).toBeUndefined();
    expect(improvementBusy([job()], { path: "R/B.md", job: "rz-b-0002" })).toBeUndefined();
    expect(improvementBusy([job()], { path: "R/B.md" })).toBeUndefined();
  });
});

describe("withNewRun", () => {
  it("replaces the old job like a retry and keeps what the note was", () => {
    const old = job({ errorKey: "noImprovementArrived", feedback: "x" });
    const jobs = withNewRun([old, job({ id: "rz-b-0002", feedback: "y" })], old, "rz-b-0002", {
      state: "teilweise",
      error: "Grund",
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "rz-b-0002",
      retryOf: [{ job: "rz-a-0001" }],
      prevState: "teilweise",
      prevError: "Grund",
    });
  });
  it("carries what the old job kept when the note was 'offen' again", () => {
    const old = job({ prevState: "fertig" });
    const jobs = withNewRun([old, job({ id: "rz-b-0002" })], old, "rz-b-0002");
    expect(prevOf(jobs[0])).toEqual({ state: "fertig" });
  });
  it("leaves the jobs alone for a first feedback", () => {
    const jobs = [job({ id: "rz-b-0002" })];
    expect(withNewRun(jobs, undefined, "rz-b-0002")).toBe(jobs);
  });
});
