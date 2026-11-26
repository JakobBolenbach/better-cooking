// Import of a social media post inside the plugin (issue #87, ADR 0005): reads the public page of the one link the
// user submitted (no login, no cookies, no tokens), then follows a link to a recipe website, or goes on like pasted
// text (offline rules or the own AI). Runs only when the user submits a link. Writes only one new note in the
// recipe folder and its cover image. The page content is untrusted: it only becomes text and an image address,
// and the note goes through recipeNote like every import (SECURITY.md).
import type { App } from "obsidian";
import { loadPage, importLocally, saveRecipe, type Saved } from "./localImport";
import { isPublicAddress } from "./network";
import { detectSource, type Detection } from "./source";
import { parseSocialPage, type SocialPage } from "./socialPage";
import { instagramEmbedUrl, nextSocialStep, socialHeaders, socialPageUrl, socialText } from "./socialFlow";
import { recipeWithAi } from "./aiImport";
import type { AiSettings } from "./ai";
import { recipeFromText } from "./textRecipe";
import type { SchemaRecipe } from "./schemaorg";
import type { NoteFormat } from "./noteFormat";
import { tr } from "./i18n";

export interface SocialContext {
  app: App;
  folder: string;
  format: NoteFormat;
  extraProperties: [string, string][];
  /** The text goes to the own AI (with its key) instead of the offline rules. */
  ai?: { settings: AiSettings; key: string | null };
}

/** `how`: which message to show (the offline rules say "split up without AI"). */
export type SocialResult = { ok: true; saved: Saved; how: "website" | "rules" | "ai" } | { ok: false; message: string };

const fail = (message: string): SocialResult => ({ ok: false, message });

/** Reads the post's page: one request, for Instagram a second one on the embed page if the first has no caption. */
export async function readSocialPage(e: Detection): Promise<{ page: SocialPage } | { error: string }> {
  const url = e.url && socialPageUrl(e.kind, e.url);
  if (!url) return { error: `${tr("socialNoRead")} ${tr("socialPasteHint")}` };
  const urls = e.kind === "instagram" ? [url, instagramEmbedUrl(url)] : [url];
  let error = "";
  for (const u of urls) {
    const r = await loadPage(u, socialHeaders(e.kind));
    if ("error" in r) error = r.error;
    else {
      const page = parseSocialPage(e.kind, r.html);
      if (page) return { page };
    }
  }
  // Never an empty note: say what happened and what the user can do (the formats change without notice).
  return { error: `${error || tr("socialNoRead")} ${tr("socialPasteHint")}` };
}

/**
 * Hook for the message when a caption gives no recipe. Issue #88 adds `captionHint` (recipe "in the bio", on a
 * website, only in a comment) in src/caption.ts; connect it here after that is merged.
 */
export function noRecipeInCaption(_text: string): string {
  return tr("textNoRecipe");
}

/** The recipe in the post's text: offline rules, or the own AI; with the cover image address of the post. */
async function recipeFromPost(
  c: SocialContext,
  page: SocialPage,
): Promise<{ recipe: SchemaRecipe; how: "rules" | "ai" } | { error: string }> {
  const text = socialText(page);
  if (c.ai) {
    const r = await recipeWithAi(c.ai.settings, c.ai.key, { text }, c.format);
    return "error" in r ? r : { recipe: r.recipe, how: "ai" };
  }
  const recipe = recipeFromText(text);
  return recipe ? { recipe, how: "rules" } : { error: noRecipeInCaption(text) };
}

/** A link in the post to a recipe website with schema.org data: the note comes from that page. */
async function fromWebsite(c: SocialContext, link: string): Promise<Saved | undefined> {
  const target = detectSource(link);
  if (target.kind !== "webseite" || !target.url || !isPublicAddress(target.url)) return undefined;
  const r = await importLocally(c.app, c.folder, target.url, c.extraProperties, c.format);
  return r.status === "gespeichert" ? r : undefined;
}

/**
 * Imports a post. Order: a link in the post to a recipe website (the source of the note is then that website, the
 * note format has no field for a second link), otherwise the post's text; the source is the post, its author and
 * cover image come along.
 */
export async function importSocial(c: SocialContext, e: Detection): Promise<SocialResult> {
  const read = await readSocialPage(e);
  if ("error" in read) return fail(read.error);
  const { page } = read;
  const step = nextSocialStep(page);
  if (step.do === "website") {
    const saved = await fromWebsite(c, step.link);
    if (saved) return { ok: true, saved, how: "website" };
  }
  if (!page.text) return fail(`${tr("socialNoRead")} ${tr("socialPasteHint")}`);
  const r = await recipeFromPost(c, page);
  if ("error" in r) return fail(r.error);
  const saved = await saveRecipe(
    c.app,
    c.folder,
    { ...r.recipe, author: r.recipe.author ?? page.author },
    { source: e.url, coverUrl: page.image, extraProperties: c.extraProperties, format: c.format },
  );
  return { ok: true, saved, how: r.how };
}
