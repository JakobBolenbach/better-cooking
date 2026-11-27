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
  type FeedbackCtx,
  type FeedbackMaterial,
  type FeedbackWay,
} from "./feedback";
import { loadPage } from "./localImport";
import { improvementBusy } from "./improve";
import { startOnNote } from "./improveStart";
import { readSocialPage } from "./socialImport";
import { socialText } from "./socialFlow";
import { processorName } from "./processor";
import { parseRecipe } from "./parse";
import { detectSource, safeSource } from "./source";
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

/** Why nothing may start for this note now: an improvement runs, or a proposal waits for review. */
export function busyMessage(p: BetterCookingPlugin, note: { path: string; job?: string }): string | undefined {
  const busy = improvementBusy(p.settings.jobs, note);
  return busy ? tr(busy === "review" ? "feedbackWaiting" : "feedbackRunning") : undefined;
}

/** Notes with feedback on their way: a second click while the first is on its way does nothing. */
const sending = new Set<string>();

/**
 * Sends the feedback with an improvement job to Claude or GitHub, with the common start (src/improveStart.ts): the job
 * is reserved, the note gets the new job ID and "offen" by compare-and-set, then the request goes. A clear refusal
 * closes the note again (`closeUnimproved`: the state its content has), no answer at all keeps the job as sent but
 * unsure. A failed or timed-out earlier run of the note is replaced like a retry.
 */
export async function sendFeedback(
  p: BetterCookingPlugin,
  path: string,
  text: string,
): Promise<{ ok: boolean; message?: string }> {
  if (sending.has(path)) return { ok: true };
  sending.add(path);
  try {
    return await send(p, path, text);
  } finally {
    sending.delete(path);
  }
}

async function send(p: BetterCookingPlugin, path: string, text: string): Promise<{ ok: boolean; message?: string }> {
  const file = p.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { ok: false, message: tr("refetchGone") };
  const feedback = cleanFeedback(text);
  if (!feedback) return { ok: false, message: tr("feedbackEmpty") };
  const format = p.noteFormat();
  const old = parseRecipe(path, await p.app.vault.read(file), 0, format.fields);
  const way = feedbackWays(old, feedbackCtx(p));
  if (way.via !== "processor") return { ok: false, message: tr("feedbackNone") };
  const busy = busyMessage(p, old);
  if (busy) return { ok: false, message: busy };
  // Only a real link goes as a link; anything else (and a note without a source) goes as the recipe text.
  const input = safeSource(old.source) ?? noteText(old);
  const r = await startOnNote(p, {
    file,
    expected: old.job,
    earlier: p.settings.jobs.find((j) => j.id === old.job && j.improve),
    e: detectSource(input),
    input,
    processor: way.processor,
    feedback,
    format,
  });
  if (!r.ok || r.unsure) return { ok: r.ok, message: r.message };
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
