import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { keyOf } from "../src/source";
import { checkJobs, jobError, jobFailed, settleJobs } from "../src/processor";
import { canDeleteFailure, failJob, failureReason, isFailedImport, orphanFailures } from "../src/importFailure";
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

  it("reads both note languages", () => {
    expect(isFailedImport(failure())).toBe(true);
    expect(isFailedImport(failure("import: failed\nimport_error: x\njob: rz-a"))).toBe(true);
    expect(isFailedImport(failure("import: fertig\nauftrag: rz-a"))).toBe(false);
  });

  it("deletes only a failure note that carries a job ID", () => {
    expect(canDeleteFailure(failure())).toBe(true);
    // a normal recipe, also one that came from an import, is never deleted
    expect(canDeleteFailure(failure("import: fertig\nauftrag: rz-a"))).toBe(false);
    expect(canDeleteFailure(failure("import: teilweise\nauftrag: rz-a"))).toBe(false);
    expect(canDeleteFailure(failure("status: ausprobieren"))).toBe(false);
    // failed but without a job: shown, but never deleted by the plugin
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

    it("every device ends up with the same job and nobody announces it", () => {
      const jobs = [job("rz-a", { device: "pc" })];
      for (const device of ["pc", "phone", null]) {
        const r = settleJobs(jobs, checkJobs(jobs, recipes(), keyOf, NOW), device, NOW);
        expect(r.announce).toEqual([]);
        expect(r.pending).toEqual([failJob(jobs[0], { ...failure() })]);
      }
    });

    it("is stable when checked again", () => {
      const once = checkJobs([job("rz-a")], recipes(), keyOf, NOW).pending;
      expect(checkJobs(once, recipes(), keyOf, NOW).pending).toEqual(once);
    });

    it("finds the note by source too, as for any note", () => {
      const other = [
        { ...failure("import: fehler\nquelle: https://instagram.com/reel/AB/\nauftrag: rz-z"), modified: NOW },
      ];
      const r = checkJobs([job("rz-a")], other, keyOf, NOW);
      expect(r.failed.map((f) => f.job.id)).toEqual(["rz-a"]);
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
});
