import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { keyOf } from "../src/source";
import { checkJobs, FOREIGN_KEEP_MS, jobError, jobFailed, settleJobs, visibleJobs, WAIT_MIN } from "../src/processor";
import {
  canDeleteFailure,
  failJob,
  failureNotesOf,
  replaceJob,
  newlyReported,
  withKnownNotes,
  failureReason,
  isFailureNote,
  orphanFailures,
} from "../src/importFailure";
import { parseRecipe } from "../src/parse";
import type { Job } from "../src/types";

const NOW = 100_000_000;
const job = (id: string, o: Partial<Job> = {}): Job => ({
  id,
  input: "https://www.instagram.com/reel/AB/",
  kind: "instagram",
  key: "instagram:AB",
  since: NOW - 60_000,
  processor: "claude",
  device: "pc",
  ...o,
});
const note = (fm: string) => `---\n${fm}\n---\n# Import gescheitert\n`;
const failure = (fm = "import: fehler\nimport_fehler: Kein Rezept, sondern ein Finanzvideo\nauftrag: rz-a") =>
  parseRecipe("Rezepte/Import gescheitert rz-a.md", note(fm), NOW);

describe("failure notes", () => {
  beforeEach(() => setLanguage("de"));

  const withContent = (fm = "import: fehler\nauftrag: rz-a") =>
    parseRecipe(
      "Rezepte/Brot.md",
      `---\n${fm}\n---\n# Brot\n\n## Zutaten\n\n- 500 g Mehl\n\n## Schritte\n\n1. Backen\n`,
      NOW,
    );

  it("reads both note languages", () => {
    expect(isFailureNote(failure())).toBe(true);
    expect(isFailureNote(failure("import: failed\nimport_error: x\njob: rz-a"))).toBe(true);
    expect(isFailureNote(failure("import: fertig\nauftrag: rz-a"))).toBe(false);
  });

  it("a recipe with import failed and content stays a recipe, and is never deletable", () => {
    const r = withContent();
    expect(r.importState).toBe("fehler");
    expect(r.ingredients.length).toBeGreaterThan(0);
    expect(isFailureNote(r)).toBe(false);
    expect(canDeleteFailure(r)).toBe(false);
    expect(canDeleteFailure(r, "rz-a")).toBe(false);
    // only steps, or only ingredients, count as content too
    const steps = parseRecipe("a.md", "---\nimport: fehler\nauftrag: rz-a\n---\n## Schritte\n\n1. Backen\n", NOW);
    expect(isFailureNote(steps)).toBe(false);
  });

  it("a recipe with import failed and content closes its job as arrived", () => {
    const r = checkJobs([job("rz-a")], [{ ...withContent(), modified: NOW }], keyOf, NOW);
    expect(r.done.map((d) => d.recipe.path)).toEqual(["Rezepte/Brot.md"]);
    expect(r.failed).toEqual([]);
  });

  it("deletes only a failure note with a job ID, and for that job if one is given", () => {
    expect(canDeleteFailure(failure())).toBe(true);
    expect(canDeleteFailure(failure(), "rz-a")).toBe(true);
    expect(canDeleteFailure(failure(), "rz-other")).toBe(false);
    // a normal recipe, also one that came from an import, is never deleted
    expect(canDeleteFailure(failure("import: fertig\nauftrag: rz-a"))).toBe(false);
    expect(canDeleteFailure(failure("import: teilweise\nauftrag: rz-a"))).toBe(false);
    expect(canDeleteFailure(failure("status: ausprobieren"))).toBe(false);
    // failed but without a job: a normal note for the plugin, never deleted
    expect(canDeleteFailure(failure("import: fehler\nimport_fehler: x"))).toBe(false);
    expect(canDeleteFailure(failure("import: fehler\nauftrag: "))).toBe(false);
  });

  it("cleans the reason to one line", () => {
    expect(failureReason({ importError: "  a\n\n b  " })).toBe("a b");
    expect(failureReason({ importError: "   " })).toBeUndefined();
    expect(failureReason({ importError: "x".repeat(500) })?.length).toBe(240);
  });

  describe("an open job gets a failure note", () => {
    const recipes = () => [{ ...failure(), modified: NOW }];

    it("closes the job as failed with the reason, not as arrived", () => {
      const r = checkJobs([job("rz-a")], recipes(), keyOf, NOW);
      expect(r.done).toEqual([]);
      expect(r.failed.map((f) => f.job.id)).toEqual(["rz-a"]);
      expect(r.pending).toHaveLength(1);
      expect(jobFailed(r.pending[0])).toBe(true);
      expect(jobError(r.pending[0])).toBe("Kein Rezept, sondern ein Finanzvideo");
      expect(r.pending[0].failedNote).toBe("Rezepte/Import gescheitert rz-a.md");
    });

    it("every device marks the job failed with the reason; only the starter's device reports it", () => {
      const jobs = [job("rz-a", { device: "pc" })];
      for (const device of ["pc", "phone", null]) {
        const r = settleJobs(jobs, checkJobs(jobs, recipes(), keyOf, NOW), device, NOW);
        expect(r.announce).toEqual([]);
        expect(r.pending).toEqual([failJob(jobs[0], { ...failure() })]);
        expect(r.failedNow.map((j) => j.id)).toEqual(device === "phone" ? [] : ["rz-a"]);
      }
    });

    it("another device shows a failed job with the reason, also if it is older than the time limit", () => {
      const old = job("rz-a", { device: "pc", since: NOW - (WAIT_MIN + 5) * 60_000, errorKey: "noRecipeArrived" });
      const r = settleJobs([old], checkJobs([old], recipes(), keyOf, NOW), "phone", NOW);
      expect(r.pending).toHaveLength(1);
      expect(jobError(r.pending[0])).toMatch(/Finanzvideo/);
      expect(r.pending[0].errorKey).toBeUndefined();
    });

    it("another device leaves a finished foreign job alone and drops it after the time limit plus a day", () => {
      const jobs = [job("rz-a", { device: "pc" })];
      const done = [{ path: "x.md", job: "rz-a", modified: NOW }];
      expect(settleJobs(jobs, checkJobs(jobs, done, keyOf, NOW), "phone", NOW).pending).toEqual(jobs);
      const old = job("rz-a", { device: "pc", since: NOW - 20 * 60_000 - FOREIGN_KEEP_MS - 1 });
      expect(settleJobs([old], checkJobs([old], done, keyOf, NOW), "phone", NOW).pending).toEqual([]);
    });

    it("the card of a foreign job whose recipe arrived is hidden, nothing is stored", () => {
      const jobs = [job("rz-a", { device: "pc" }), job("rz-b", { device: "phone" }), job("rz-c", { device: "pc" })];
      const done = [
        { path: "a.md", job: "rz-a", modified: NOW },
        { path: "b.md", job: "rz-b", modified: NOW },
      ];
      expect(visibleJobs(jobs, done, keyOf, "phone", NOW).map((j) => j.id)).toEqual(["rz-b", "rz-c"]);
      expect(visibleJobs(jobs, done, keyOf, "pc", NOW).map((j) => j.id)).toEqual(["rz-a", "rz-c"]);
      expect(visibleJobs(jobs, done, keyOf, null, NOW)).toHaveLength(3);
    });

    it("is stable when checked again", () => {
      const once = checkJobs([job("rz-a")], recipes(), keyOf, NOW).pending;
      expect(checkJobs(once, recipes(), keyOf, NOW).pending).toEqual(once);
    });

    it("matches a failure note by job ID only, never by source", () => {
      const other = [
        { ...failure("import: fehler\nquelle: https://instagram.com/reel/AB/\nauftrag: rz-z"), modified: NOW },
      ];
      const r = checkJobs([job("rz-a")], other, keyOf, NOW);
      expect(r.failed).toEqual([]);
      expect(r.pending[0].failedNote).toBeUndefined();
      // a real recipe of the same source still closes the job
      const real = [{ path: "x.md", source: "https://instagram.com/reel/AB/", modified: NOW }];
      expect(checkJobs([job("rz-a")], real, keyOf, NOW).done).toHaveLength(1);
    });

    it("an empty reason gets the fallback text", () => {
      const empty = [{ ...failure("import: fehler\nauftrag: rz-a"), modified: NOW }];
      const r = checkJobs([job("rz-a")], empty, keyOf, NOW);
      expect(r.pending[0].errorKey).toBe("importFailedNoReason");
      expect(jobError(r.pending[0])).toMatch(/keinen Grund/);
    });

    it("replaces the timeout error of an older run", () => {
      const late = job("rz-a", { since: NOW - 30 * 60_000, errorKey: "noRecipeArrived" });
      const r = checkJobs([late], recipes(), keyOf, NOW);
      expect(r.pending[0].errorKey).toBeUndefined();
      expect(r.pending[0].error).toMatch(/Finanzvideo/);
    });

    it("a real recipe for the same job wins over a failure note", () => {
      const both = [...recipes(), { path: "Rezepte/Brot.md", job: "rz-a", modified: NOW }];
      const r = checkJobs([job("rz-a")], both, keyOf, NOW);
      expect(r.done.map((d) => d.recipe.path)).toEqual(["Rezepte/Brot.md"]);
      expect(r.failed).toEqual([]);
    });

    it("a failure note of another job leaves the job alone", () => {
      const r = checkJobs([job("rz-b", { key: "tiktok:Z" })], recipes(), keyOf, NOW);
      expect(r.failed).toEqual([]);
      expect(r.pending[0].failedNote).toBeUndefined();
    });
  });

  it("knows failure notes without an open job", () => {
    const linked = { ...failure(), path: "a.md" };
    const free = { ...failure("import: fehler\nauftrag: rz-old"), path: "b.md" };
    const jobs = [job("rz-a"), job("rz-x", { failedNote: "c.md" })];
    expect(orphanFailures([linked, free, { ...free, path: "c.md" }], jobs).map((f) => f.path)).toEqual(["b.md"]);
  });

  it("hides the failure note of a replaced run while the new job is open", () => {
    const old = { ...failure("import: fehler\nauftrag: rz-old"), path: "old.md" };
    const again = job("rz-new", { retryOf: [{ job: "rz-old", note: "old.md" }] });
    expect(orphanFailures([old], [again])).toEqual([]);
    // also a note that shows up later, known only by the job ID of the replaced run
    const late = { ...old, path: "late.md" };
    expect(orphanFailures([late], [again])).toEqual([]);
    expect(orphanFailures([old], [])).toHaveLength(1);
  });

  it("hides a failure note whose job ID a real recipe carries", () => {
    const f = { ...failure(), path: "f.md" };
    expect(orphanFailures([f], [], [{ job: "rz-a" }])).toEqual([]);
    expect(orphanFailures([f], [], [{ job: "rz-b" }])).toHaveLength(1);
  });

  it("only the new job after a retry remembers the old runs", () => {
    const old = job("rz-1", { failedNote: "1.md", retryOf: [{ job: "rz-0", note: "0.md" }] });
    const r = replaceJob([old, job("rz-x"), job("rz-2"), job("rz-3"), job("rz-4")], old, "rz-3");
    expect(r.map((j) => j.id)).toEqual(["rz-x", "rz-2", "rz-3", "rz-4"]);
    expect(r.filter((j) => j.retryOf).map((j) => j.id)).toEqual(["rz-3"]);
    expect(r[2].retryOf).toEqual([
      { job: "rz-0", note: "0.md" },
      { job: "rz-1", note: "1.md" },
    ]);
  });

  it("adds the notes of the vault that belong to a job by job ID, for the question and the removal", () => {
    const a = job("rz-n", { failedNote: "n.md", retryOf: [{ job: "rz-o", note: "o.md" }] });
    const found = [
      { path: "n.md", job: "rz-n" },
      { path: "renamed.md", job: "rz-o" },
      { path: "late.md", job: "rz-n" },
      { path: "other.md", job: "rz-z" },
      { path: "nojob.md" },
    ];
    const [r] = withKnownNotes([a], found);
    expect(failureNotesOf(r).map((n) => n.note)).toEqual(["n.md", "o.md", "renamed.md", "late.md"]);
    expect(withKnownNotes([a], [{ path: "n.md", job: "rz-n" }])[0]).toBe(a);
  });

  it("reports a failure once per device, and remembers only the newest ones", () => {
    const j = [job("a"), job("b")];
    const first = newlyReported(j, []);
    expect(first.fresh.map((x) => x.id)).toEqual(["a", "b"]);
    expect(newlyReported(j, first.reported).fresh).toEqual([]);
    expect(newlyReported([job("c")], first.reported).reported).toEqual(["a", "b", "c"]);
    expect(newlyReported([job("c")], ["a", "b"], 2).reported).toEqual(["b", "c"]);
  });

  it("content that makes a note a recipe: ingredients, steps, tips, notes, attempts, but not the description", () => {
    const body = (b: string) => parseRecipe("a.md", `---\nimport: fehler\nauftrag: rz-a\n---\n${b}`, NOW);
    expect(isFailureNote(body("# X\n\nDer Beitrag enthält kein Rezept.\n"))).toBe(true);
    expect(isFailureNote(body("# X\n\n## Tipps\n\n- Kalt servieren\n"))).toBe(false);
    expect(isFailureNote(body("# X\n\n## Notizen\n\n- Von Oma\n"))).toBe(false);
    expect(isFailureNote(body("# X\n\n## Versuche\n\n### 2026-01-01\n\n- gut\n"))).toBe(false);
    expect(canDeleteFailure(body("# X\n\n## Notizen\n\n- Von Oma\n"), "rz-a")).toBe(false);
  });

  it("lists the notes a failed job answers for", () => {
    const a = job("rz-n", { failedNote: "n.md", retryOf: [{ job: "rz-o", note: "o.md" }, { job: "rz-p" }] });
    expect(failureNotesOf(a)).toEqual([
      { job: "rz-n", note: "n.md" },
      { job: "rz-o", note: "o.md" },
    ]);
  });
});
