// Closes the open jobs against the notes in the recipe folder: announces a recipe that arrived, marks a job whose
// failure note arrived, and reports a failure once on this device (rules: src/processor.ts, src/importFailure.ts).
import { Notice } from "obsidian";
import type BetterCookingPlugin from "./main";
import { checkJobs, settleJobs } from "./processor";
import { newlyReported } from "./importFailure";
import { cleanFailureChain } from "./failureService";
import { deviceId } from "./importSyncService";
import { findingsText } from "./importCheck";
import { keyOf } from "./source";
import { tr } from "./i18n";
import type { Recipe } from "./types";

const REPORTED_KEY = "better-cooking-failed-reported";

/** IDs of the jobs whose failure was announced on this device (Obsidian's local storage, not synchronised). */
function reportedIds(p: BetterCookingPlugin): string[] {
  try {
    const v: unknown = JSON.parse(String(p.app.loadLocalStorage(REPORTED_KEY) ?? "[]"));
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** `recipes` are all notes of the recipe folder, failure notes included. */
export async function reconcileJobs(p: BetterCookingPlugin, recipes: Recipe[]) {
  if (!p.settings.jobs.length) return;
  const now = Date.now();
  const r = settleJobs(p.settings.jobs, checkJobs(p.settings.jobs, recipes, keyOf, now), deviceId(p.app), now);
  const failure = newlyReported(r.failedNow, reportedIds(p));
  if (failure.fresh.length) {
    try {
      p.app.saveLocalStorage(REPORTED_KEY, JSON.stringify(failure.reported));
    } catch {
      // A notice that comes twice is better than none.
    }
  }
  for (const j of failure.fresh)
    new Notice(j.error ? tr("importFailedNotice", { why: j.error }) : tr("importFailedNoReason"), 8000);
  for (const f of r.announce) {
    new Notice(
      f.recipe.findings
        ? tr("recipeSuspicious", { title: f.recipe.title, what: findingsText(f.recipe.findings) })
        : tr("recipeArrived", { title: f.recipe.title }),
      f.recipe.findings ? 0 : 5000,
    );
    void cleanFailureChain(p, f.job);
  }
  if (JSON.stringify(r.pending) !== JSON.stringify(p.settings.jobs)) await p.save({ jobs: r.pending });
}
