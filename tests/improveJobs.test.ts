// The jobs of improvements (ADR 0007): dropping, the review kept in a job, replaced runs, a retry's new job ID, marks.
import { describe, expect, it } from "vitest";
import { dropImprovement, markRecipes, rebindJob, replacedRun, reviewJobOf, withReview } from "../src/improve";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import type { Job } from "../src/types";

const DE = DEFAULT_FORMAT;
const EN = makeNoteFormat("en").format;

const job = (o: object) =>
  ({ id: "rz-m-0001", input: "x", kind: "text", since: 1, processor: "claude", ...o }) as never as Job;

describe("jobs of improvements", () => {
  it("drop: marks only an open improvement job of that ID as dropped", () => {
    const jobs = [job({ improve: true }), job({ id: "rz-m-0002", improve: true })];
    const r = dropImprovement(jobs, "rz-m-0001");
    expect(r.jobs[0]).toMatchObject({ dropped: true });
    expect(r.jobs[1]).not.toHaveProperty("dropped");
    const normal = [job({})];
    expect(dropImprovement(normal, "rz-m-0001").jobs).toBe(normal);
    expect(dropImprovement(jobs, "rz-zzz-0000").jobs).toBe(jobs);
  });
  it("drop: removes a job with a review and says which proposal was waiting", () => {
    const review = { proposal: "R/Verbesserungen/rz-m-0001.md", target: "R/Brot.md" };
    const r = dropImprovement([job({ improve: true, review }), job({ id: "rz-m-0002" })], "rz-m-0001");
    expect(r.jobs.map((j) => j.id)).toEqual(["rz-m-0002"]);
    expect(r.review).toEqual(review);
  });
  it("review: is kept on the job, for a job this device does not know too, and not saved twice", () => {
    const review = { proposal: "P.md", target: "N.md" };
    const known = [job({ improve: true })];
    const withIt = withReview(known, "rz-m-0001", review, 5);
    expect(withIt[0]).toMatchObject({ id: "rz-m-0001", review });
    expect(withReview(withIt, "rz-m-0001", review, 6)).toBe(withIt);
    const stub = withReview([], "rz-m-0009", review, 5);
    expect(stub).toEqual([expect.objectContaining({ id: "rz-m-0009", improve: true, review, since: 5 })]);
  });
  it("review: belongs to exactly the note it was made for", () => {
    const jobs = [job({ improve: true, review: { proposal: "P.md", target: "R/Brot.md" } })];
    expect(reviewJobOf(jobs, "R/Brot.md")?.id).toBe("rz-m-0001");
    expect(reviewJobOf(jobs, "R/Brot 2.md")).toBeUndefined();
  });
  it("retry: a run that a retry replaced is found by retryOf", () => {
    const jobs = [job({ id: "rz-m-0002", retryOf: [{ job: "rz-m-0001" }] })];
    expect(replacedRun(jobs, "rz-m-0001")).toBe(true);
    expect(replacedRun(jobs, "rz-m-0002")).toBe(false);
  });
});

describe("rebindJob", () => {
  const note = "---\ntyp: rezept\nauftrag: rz-m-0001\nimport: offen\n---\n# Brot\n";
  it("sets the new job ID if the note still has the old one, and changes nothing else", () => {
    const next = rebindJob(note, DE, "rz-m-0001", "rz-m-0002")!;
    expect(next).toBe(note.replace("rz-m-0001", "rz-m-0002"));
  });
  it("is a compare-and-set", () => {
    expect(rebindJob(note, DE, "rz-m-0003", "rz-m-0002")).toBeNull();
    expect(rebindJob("# Brot\n", DE, "rz-m-0001", "rz-m-0002")).toBeNull();
    expect(rebindJob(note.replace("auftrag", "job"), EN, "rz-m-0001", "rz-m-0002")).toContain("job: rz-m-0002");
  });
});

describe("markRecipes", () => {
  const r = (o: { importState?: string; importError?: string }) => ({
    path: "R/Brot.md",
    job: "rz-m-0001",
    importState: "offen",
    importError: undefined as string | undefined,
    ...o,
  });
  const o = (open: string[], banner?: "ready" | "waiting") => ({
    banner: () => banner,
    open: new Set(open),
    reason: "läuft nicht mehr",
  });
  it("shows 'offen' as 'teilweise' without an open job, and keeps it with one (also one with a review)", () => {
    expect(markRecipes([r({})], o([]))[0]).toMatchObject({ importState: "teilweise", importError: "läuft nicht mehr" });
    expect(markRecipes([r({})], o(["rz-m-0001"]))[0].importState).toBe("offen");
  });
  it("keeps a reason that is there and other states alone", () => {
    expect(markRecipes([r({ importError: "x" })], o([]))[0].importError).toBe("x");
    expect(markRecipes([r({ importState: "fertig" })], o([]))[0].importState).toBe("fertig");
  });
  it("adds the banner state the caller gives", () => {
    expect(markRecipes([r({})], o(["rz-m-0001"], "waiting"))[0].improvement).toBe("waiting");
  });
});
