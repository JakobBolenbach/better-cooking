// English strings of the improvement proposals (ADR 0007, src/improve.ts), merged into the dictionary of src/strings/en.ts.
import type { improveDe } from "./improveDe";

export const improveEn: Record<keyof typeof improveDe, string> = {
  refetchPartState: "Import state",
  refetchPartTimeline: "Timeline graphic (missing in the note)",
  improveWaiting: "An improved version is here. It is applied on the device that started the import.",
  improveDiscard: "Discard",
  improveNewText: "New text",
  improveStale: "The improvement is no longer running. The first version stays.",
  improveClaimedTitle: "Improvement not merged",
  improveClaimedHint:
    "A recipe carries the job ID of this improvement but is not waiting for it. It is not merged and not saved as a new recipe. You can discard it.",
  improveInvalidTitle: "Invalid proposal",
  improveInvalidHint: "The file name and the job ID differ or the ID is invalid. The file was not applied.",
  importStateOpen: "still open",
  firstVersionSaved: "First version of “{title}” saved. {processor} will improve it in a few minutes.",
  firstVersionNoJob:
    "First version of “{title}” saved. {processor} could not be asked to improve it: {why} The recipe stays as it is.",
  procRunAlways:
    "If the plugin reads a recipe from the post, {processor} improves it afterwards (a run that can use up quota or cost money). If the recipe is on a linked recipe website, that page is saved without a run. If the post cannot be read, it goes to {processor}.",
  procRunPartial:
    "If the result is incomplete (only ingredients or only steps), {processor} improves it afterwards (a run that can use up quota or cost money). A complete one is saved without a run. If the post cannot be read or holds no recipe, it goes to {processor}.",
  translateFirstVersion:
    "This recipe is being improved right now. The translation shows the first version and does not change with the improvement.",
  improveUnsure:
    "It is unclear whether {processor} got the job: {why} The recipe says “open”. If nothing comes, you can try again after the waiting time.",
  improveCrashed: "Obsidian was closed in between.",
  improveRetryAsk: "{processor} was not asked to improve it.",
  improveRetryFailed: "The new attempt failed.",
  improveRetryChanged: "The note was changed meanwhile, so nothing was started again.",
  viaThen: ", then {processor}",
  improveNotStarted: "The improvement was not started: {why}",
  improvingBadge: "Being improved",
  improvingLine: "{processor} is improving this recipe right now. You can already use and edit it.",
  improveBanner: "Improved version ready",
  improveView: "Review",
  improveTitle: "Improved version",
  improveIntro:
    "The import delivered an improved version. Here you see what would change. Status, rating, attempts, your own notes and sections stay. Before writing, the current version is saved in the subfolder Vorversionen.",
  improveVia: "Improved version from the import.",
  improveApply: "Apply",
  improveApplying: "Applying …",
  improved: "Improved: {title}",
  improvedUndone: "Improvement undone.",
  improvedUndoStale: "The note changed in the meantime, so nothing was undone.",
  improveFailedNotice: "Improvement failed: {why}. The first version stays.",
  improveFailedNoReason: "no reason given",
  improveGone: "The improved version or the recipe no longer exists.",
  improveChangedMeanwhile: "The note changed in the meantime. The changes are worked out again.",
  improveApplyFailed: "Applying failed: {error}",
  improveOrphansHeading: "Improvements without an assigned recipe",
  improveOrphanTitle: "Recipe not found",
  improveOrphanHint: "The collection has no recipe for this improved version any more.",
  improveOrphanSave: "Save as a new recipe",
  improveOrphanDiscard: "Discard",
  improveOrphanSaved: "Saved: {title}",
  improveOrphanDiscarded: "Improvement discarded.",
  improveSyncingTitle: "Waiting for another device",
  improveSyncingHint:
    "The note for this improved version has not arrived here yet, probably because another device has not synced. Discarding removes the proposal on all devices, including the one that expects it.",
  improveUnexpectedTitle: "Not expected any more",
  improveUnexpectedHint:
    "Belongs to “{note}”, which does not expect it any more. Discarding removes the proposal on all devices.",
  improveNoSave: "This proposal is not saved as a new recipe.",
  improveSyncingOpen: "Open recipe “{title}”",
  noImprovementArrived: "No improvement arrived. Does your processor follow the 0.9 contract? The first version stays.",
  github422Improve:
    "The workflow does not know the input “verbessern” or “hinweis”. Update your workflow to the 0.9 contract.",
};
