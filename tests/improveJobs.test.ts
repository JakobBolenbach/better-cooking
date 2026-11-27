// The jobs of improvements (ADR 0007): dropping, the review kept in a job, replaced runs, a retry's new job ID, marks.
import { describe, expect, it } from "vitest";
import {
  closeUnimproved,
  dropImprovement,
  markRecipes,
  rebindJob,
  upsertJob,
  replacedRun,
  reviewJobOf,
  withoutFirstVersions,
  withReview,
} from "../src/improve";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import type { Job } from "../src/types";
import { syncOpen } from "../src/importSync";
import { checkJobs } from "../src/processor";
import { recipeNote } from "../src/recipeNote";

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
    open: new Map(open.map((id) => [id, undefined])),
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

describe("first versions in the overview (#133)", () => {
  const note = (o: object) => ({ job: "rz-m-0001", importState: "offen", ...o });
  it("hides the card of a running improvement job whose note exists", () => {
    const jobs = [job({ improve: true }), job({ id: "rz-m-0002" })];
    expect(withoutFirstVersions(jobs, [note({})], 2).map((j) => j.id)).toEqual(["rz-m-0002"]);
  });
  it("keeps the card without a note, for a normal job, for a note that is no first version and for a failed or late job", () => {
    const run = [job({ improve: true })];
    expect(withoutFirstVersions(run, [], 2)).toEqual(run);
    expect(withoutFirstVersions(run, [note({ importState: "fertig" })], 2)).toEqual(run);
    const normal = [job({})];
    expect(withoutFirstVersions(normal, [note({})], 2)).toEqual(normal);
    const failed = [job({ improve: true, errorKey: "noImprovementArrived" })];
    expect(withoutFirstVersions(failed, [note({})], 2)).toEqual(failed);
    expect(withoutFirstVersions(run, [note({})], 60 * 60_000)).toEqual(run);
  });
  const r = { path: "R/Brot.md", job: "rz-m-0001", importState: "offen", importError: undefined };
  const open = (jobs: Job[]) => ({
    banner: () => undefined,
    open: new Map<string, Job | undefined>(jobs.map((j) => [j.id, j])),
    reason: "x",
  });
  it("marks a first version with an open job as being improved, with the job", () => {
    const j = job({ improve: true, session: "https://claude.ai/code/s" });
    const m = markRecipes([r], open([j]))[0];
    expect(m.improving?.job).toBe(j);
    expect(m.importState).toBe("offen");
  });
  it("marks it too while the job request is on its way (no job yet), and leaves others unmarked", () => {
    const starting = { banner: () => undefined, open: new Map([["rz-m-0001", undefined]]), reason: "x" };
    expect(markRecipes([r], starting)[0].improving).toEqual({ job: undefined });
    expect(markRecipes([{ ...r, importState: "fertig" }], open([job({})]))[0].improving).toBeUndefined();
    expect(markRecipes([r], open([]))[0].improving).toBeUndefined();
  });
});

describe("more on first versions (#133)", () => {
  const r = { path: "R/Brot.md", job: "rz-m-0001", importState: "offen", importError: undefined };
  const open = (jobs: Job[]) => ({ open: new Map(jobs.map((j) => [j.id, j])), reason: "x" });
  it("does not say 'being improved' while a proposal waits (banner) or lies on another device", () => {
    const o = open([job({ improve: true })]);
    for (const banner of ["ready", "waiting"] as const) {
      const m = markRecipes([r], { ...o, banner: () => banner })[0];
      expect(m.improving).toBeUndefined();
      expect(m.improvement).toBe(banner);
    }
  });
  it("hides a reserved job (not sent yet) even before its note exists, but not a failed one", () => {
    const starting = job({ improve: true, starting: "s1" });
    expect(withoutFirstVersions([starting], [], 2)).toEqual([]);
    expect(withoutFirstVersions([{ ...starting, errorKey: "noImprovementArrived" }], [], 2)).toHaveLength(1);
  });
  it("does not sync for a reserved job", () => {
    expect(syncOpen(job({ improve: true }), 2)).toBe(true);
    expect(syncOpen(job({ improve: true, starting: "s1" }), 2)).toBe(false);
  });
  it("puts the real job in place of the reservation, or adds it", () => {
    const reserved = job({ improve: true, starting: "s1" });
    const real = job({ improve: true, session: "s" });
    expect(upsertJob([reserved, job({ id: "x" })], real)).toEqual([real, job({ id: "x" })]);
    expect(upsertJob([], real)).toEqual([real]);
  });
  it("sets a hidden record of a review to the processor it was given", () => {
    const jobs = withReview([], "rz-x", { proposal: "P", target: "T" }, 1, "github");
    expect(jobs[0].processor).toBe("github");
  });
});

describe("closeUnimproved", () => {
  const note = (recipe: object, extra = "") =>
    recipeNote({ title: "Brot", images: [], ...recipe } as never, {
      today: "2026-11-27",
      job: "rz-m-0001",
      fromText: true,
    }) + extra;
  const complete = { ingredients: ["4 Eier"], steps: [{ text: "Backen." }] };
  const why = "Die Verbesserung wurde nicht gestartet: offline.";
  it("gives a complete first version the state 'fertig', without an error line", () => {
    const out = closeUnimproved(note(complete), "rz-m-0001", why, DE)!;
    expect(out).toContain("import: fertig");
    expect(out).toMatch(/import_fehler:\s*(""|)\n/);
  });
  it("gives an incomplete one 'teilweise' with what is missing and then the reason", () => {
    const out = closeUnimproved(note({ ingredients: ["4 Eier"], steps: [] }), "rz-m-0001", why, DE)!;
    expect(out).toContain("import: teilweise");
    expect(out).toContain(`Der Text enthält keine Schritte. ${why}`);
    const en = closeUnimproved(note({ ingredients: [], steps: [{ text: "Backen." }] }, ""), "rz-m-0001", why, DE)!;
    expect(en).toContain("keine Zutaten");
  });
  it("writes nothing for another job ID, a note that is not 'offen', or text without frontmatter", () => {
    expect(closeUnimproved(note(complete), "rz-m-0002", why, DE)).toBeNull();
    const done = note(complete).replace("import: offen", "import: fertig");
    expect(closeUnimproved(done, "rz-m-0001", why, DE)).toBeNull();
    expect(closeUnimproved("# Brot", "rz-m-0001", why, DE)).toBeNull();
  });
});

describe("a reserved job (#133)", () => {
  it("is never counted as timed out, however old", () => {
    const old = job({ improve: true, starting: "s1", since: 1 });
    const r = checkJobs([old], [], () => undefined, 10 * 60 * 60_000);
    expect(r.pending[0]).not.toHaveProperty("errorKey");
    const late = checkJobs([{ ...old, starting: undefined }], [], () => undefined, 10 * 60 * 60_000);
    expect(late.pending[0].errorKey).toBe("noImprovementArrived");
  });
});
