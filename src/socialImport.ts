// Import of a social media post inside the plugin (issue #87, ADR 0005): reads the public page of the one link the
// user submitted (no login, no cookies, no tokens), then goes on like pasted text (offline rules or the own AI), or
// follows a link in the post to a recipe website if the caption holds no recipe. Runs only when the user submits a
// link. Writes only one new note in the recipe folder and its cover image. The page content is untrusted: it only
// becomes text and an image address, and the note goes through recipeNote like every import (SECURITY.md).
import type { App } from "obsidian";
import { loadPage, importLocally, saveRecipe, type Saved } from "./localImport";
import { isPublicAddress } from "./network";
import { detectSource, findDuplicate, type Detection } from "./source";
import { parseSocialPage, type SocialPage } from "./socialPage";
import {
  instagramEmbedUrl,
  postId,
  socialHeaders,
  socialPageUrl,
  socialPlan,
  socialText,
  type FailReason,
} from "./socialFlow";
import { recipeWithAi } from "./aiImport";
import type { AiSettings } from "./ai";
import { recipeFromText } from "./textRecipe";
import { missingRecipeHint } from "./caption";
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
  /** The recipes in the collection, to stop before a linked page that is already saved. */
  recipes: { source?: string }[];
}

/** `how`: which message to show (the offline rules say "split up without AI"). */
export type SocialResult =
  { ok: true; saved: Saved; how: "website" | "rules" | "ai" } | { ok: false; message: string; why: FailReason };

const fail = (message: string, why: FailReason): SocialResult => ({ ok: false, message, why });
const unreadable = () => fail(`${tr("socialNoRead")} ${tr("socialPasteHint")}`, "unreadable");

/** Reads the post's page: one request, for Instagram a second one on the embed page if the first has no caption. */
export async function readSocialPage(e: Detection): Promise<{ page: SocialPage } | { error: string }> {
  const url = socialPageUrl(e);
  if (!url || !isPublicAddress(url)) return { error: `${tr("socialNoRead")} ${tr("socialPasteHint")}` };
  const urls = e.kind === "instagram" ? [url, instagramEmbedUrl(url)] : [url];
  let error = "";
  for (const u of urls) {
    const r = await loadPage(u, socialHeaders(e.kind));
    if ("error" in r) error = r.error;
    else {
      const page = parseSocialPage(e.kind, r.html, postId(e));
      if (page) return { page };
    }
  }
  // Never an empty note: say what happened and what the user can do (the formats change without notice).
  return { error: `${error || tr("socialNoRead")} ${tr("socialPasteHint")}` };
}

type Linked = { saved: Saved } | { duplicate: string } | { noData: boolean };

/**
 * A link in the post to a recipe website with schema.org data: the note comes from that page, and its source is
 * that page (the note format has no field for a second link). An already saved page stops the import.
 */
async function fromWebsite(c: SocialContext, link: string): Promise<Linked> {
  const target = detectSource(link);
  if (target.kind !== "webseite" || !target.url || !isPublicAddress(target.url)) return { noData: false };
  const dup = findDuplicate(target, c.recipes);
  if (dup) return { duplicate: target.url };
  const r = await importLocally(c.app, c.folder, target.url, c.extraProperties, c.format);
  if (r.status === "gespeichert") return { saved: r };
  return { noData: r.status === "keinSchema" };
}

/**
 * The recipe in the post's text: offline rules (`rules`, already read by the caller with the caption rules), or the
 * own AI. A caption that only announces a recipe elsewhere ("in the bio", on a website, in a comment) gives the hint
 * instead (src/caption.ts, the same check as for pasted text in src/main.ts).
 */
async function recipeFromPost(
  c: SocialContext,
  page: SocialPage,
  rules: SchemaRecipe | undefined,
): Promise<{ recipe: SchemaRecipe; how: "rules" | "ai" } | { error: string; why: FailReason }> {
  const text = socialText(page);
  const hint = missingRecipeHint(text, !!rules, !!c.ai);
  if (hint) return { error: tr(hint), why: "noRecipe" };
  if (c.ai) {
    const r = await recipeWithAi(c.ai.settings, c.ai.key, { text }, c.format);
    if ("error" in r) return { error: r.error, why: r.technical ? "technical" : "noRecipe" };
    return { recipe: r.recipe, how: "ai" };
  }
  return rules ? { recipe: rules, how: "rules" } : { error: tr("textNoRecipe"), why: "noRecipe" };
}

/**
 * Imports a post. The caption comes first: if it holds ingredients and steps, it is the recipe and no link is
 * followed. Otherwise up to three links in the post are tried in order (the first website with schema.org data
 * wins; the note's source is then that website), and last the caption's text.
 */
export async function importSocial(c: SocialContext, e: Detection): Promise<SocialResult> {
  const read = await readSocialPage(e);
  if ("error" in read) return fail(read.error, "unreadable");
  const { page } = read;
  const rules = page.text ? recipeFromText(socialText(page), { caption: true }) : undefined;
  let withoutData = false;
  for (const link of socialPlan(page, rules).links) {
    const r = await fromWebsite(c, link);
    if ("saved" in r) return { ok: true, saved: r.saved, how: "website" };
    if ("duplicate" in r)
      return fail(`${tr("alreadySaved", { title: r.duplicate })} ${tr("socialDuplicate")}`, "duplicate");
    withoutData ||= r.noData;
  }
  const noData = withoutData ? `${tr("socialLinkNoData")} ` : "";
  if (!page.text) return withoutData ? fail(noData.trim(), "noRecipe") : unreadable();
  const r = await recipeFromPost(c, page, rules);
  if ("error" in r) return fail(`${noData}${r.error}`, r.why);
  const saved = await saveRecipe(
    c.app,
    c.folder,
    { ...r.recipe, author: r.recipe.author ?? page.author },
    { source: e.url, coverUrl: page.image, extraProperties: c.extraProperties, format: c.format },
  );
  return { ok: true, saved, how: r.how };
}
