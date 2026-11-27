// Feedback on a recipe (issue #120) inside Obsidian: reads the recipe again with the user's feedback through the own
// AI (the result goes through the same preview and merge as "Fetch again", src/refetchService.ts), or sends the
// feedback with an improvement job to Claude or GitHub (ADR 0007, the proposal arrives as for any improvement).
// Runs only on the user's click. The rules are in src/feedback.ts.
import { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { AI_KEY_ID } from "./ai";
import { type AiSource, recipeWithAi } from "./aiImport";
import {
  cleanFeedback,
  currentRecipe,
  feedbackWays,
  noteText,
  withJobId,
  type FeedbackCtx,
  type FeedbackMaterial,
  type FeedbackWay,
} from "./feedback";
import { loadPage } from "./localImport";
import { rebindJob } from "./improve";
import { writeIfChanged } from "./improveTarget";
import { readSocialPage } from "./socialImport";
import { socialText } from "./socialFlow";
import { jobFailed, newJobId, processorName } from "./processor";
import { parseRecipe } from "./parse";
import { detectSource } from "./source";
import type { SchemaRecipe } from "./schemaorg";
import type { Recipe } from "./types";
import type { Refetcher } from "./refetchService";
import type { FeedbackApi } from "./ui/feedbackPanel";
import { tr } from "./i18n";

/** What is set up, as the ways need it. */
export function feedbackCtx(p: BetterCookingPlugin): FeedbackCtx {
  const ready = p.processorInfo().ready;
  return { ownAi: ready.ai, claude: ready.claude, github: ready.github };
}

/** What the own AI reads for this note; a source that cannot be read gives the note's own text instead. */
async function sourceFor(old: Recipe, wanted: FeedbackMaterial): Promise<{ source: AiSource; used: FeedbackMaterial }> {
  if (wanted === "page") {
    const page = await loadPage(old.source!);
    if (!("error" in page)) return { source: { url: old.source, html: page.html }, used: "page" };
  } else if (wanted === "caption") {
    const read = await readSocialPage(detectSource(old.source!));
    if ("page" in read) return { source: { text: socialText(read.page) }, used: "caption" };
  }
  return { source: {}, used: "note" };
}

/** The recipe read again by the own AI with the feedback, and what it was read from; or a message. */
export async function freshWithFeedback(
  p: BetterCookingPlugin,
  old: Recipe,
  feedback: string,
  way: Extract<FeedbackWay, { via: "ai" }>,
): Promise<{ recipe: SchemaRecipe; coverUrl?: string; used: FeedbackMaterial } | { error: string }> {
  const { source, used } = await sourceFor(old, way.material);
  const r = await recipeWithAi(p.ai(), p.secret(AI_KEY_ID), source, p.noteFormat(), {
    text: feedback,
    current: currentRecipe(old),
  });
  return "error" in r ? { error: r.error } : { ...r, used };
}

/**
 * Sends the feedback with an improvement job to Claude or GitHub. The note's `auftrag` is set to the new job ID first
 * (compare-and-set), so the proposal always finds its note; if the processor does not accept the job, the old ID is
 * put back. The proposal is applied or reviewed like any other improvement.
 */
export async function sendFeedback(
  p: BetterCookingPlugin,
  path: string,
  text: string,
): Promise<{ ok: boolean; message?: string }> {
  const file = p.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { ok: false, message: tr("refetchGone") };
  const feedback = cleanFeedback(text);
  if (!feedback) return { ok: false, message: tr("feedbackEmpty") };
  const format = p.noteFormat();
  const old = parseRecipe(path, await p.app.vault.read(file), 0, format.fields);
  const way = feedbackWays(old, feedbackCtx(p));
  if (way.via !== "processor") return { ok: false, message: tr("feedbackNone") };
  if (old.job && p.settings.jobs.some((j) => j.id === old.job && j.improve && !j.dropped && !jobFailed(j)))
    return { ok: false, message: tr("feedbackRunning") };
  // A note without a link goes to the processor as text.
  const input = old.source || noteText(old);
  const e = detectSource(input);
  const id = newJobId();
  if (!(await writeIfChanged(p, file, (t) => withJobId(t, format, old.job, id))))
    return { ok: false, message: tr("feedbackChanged") };
  const r = await p.sendJob(e, input, way.processor, undefined, { id, feedback });
  if (!r.ok) {
    if (old.job) await writeIfChanged(p, file, (t) => rebindJob(t, format, id, old.job!));
    return { ok: false, message: r.message };
  }
  return { ok: true, message: tr("feedbackSent", { name: processorName(way.processor) }) };
}

/** What the recipe page's dialog calls (src/ui/feedbackPanel.tsx). */
export function feedbackApi(
  p: BetterCookingPlugin,
  refetcher: Pick<Refetcher, "previewFeedback">,
  notify: (message: string) => void,
): FeedbackApi {
  return {
    way: (r) => feedbackWays(r, feedbackCtx(p)),
    preview: (path, text) => refetcher.previewFeedback(path, text),
    send: async (path, text) => {
      const r = await sendFeedback(p, path, text);
      if (r.ok && r.message) notify(r.message);
      return r;
    },
  };
}
