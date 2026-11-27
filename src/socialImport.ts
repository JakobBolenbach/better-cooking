// Import of a social media post inside the plugin (issue #87, ADR 0005): reads the public page of the one link the
// user submitted (no login, no cookies, no tokens), then goes on like pasted text (offline rules or the own AI), or
// follows a link in the post to a recipe website if the caption holds no recipe. Runs only when the user submits a
// link. Writes only one new note in the recipe folder and its cover image. The page content is untrusted: it only
// becomes text and an image address, and the note goes through recipeNote like every import (SECURITY.md).
// The decisions and messages are in src/socialFlow.ts and src/socialOutcome.ts (pure, tested); this file only runs the requests.
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
import { hasRecipeParts, pageFailure, socialFailure, stopsAfter, type Failure, type LinkTry } from "./socialOutcome";
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
  /** Links in the post may be followed (the setting "Rezeptseiten selbst lesen", src/extraProperties.ts). */
  followLinks: boolean;
  /**
   * A processor is set up: the recipe found is written as a first version (`import: offen`) with this job ID, and the
   * caller starts the improvement job with it (ADR 0007, #133).
   */
  job?: string;
}

/** `how`: which message to show (the offline rules say "split up without AI"). */
export type SocialResult =
  { ok: true; saved: Saved; how: "website" | "rules" | "ai"; firstVersion?: true } | ({ ok: false } & Failure);

const failed = (f: Failure): SocialResult => ({ ok: false, ...f });

/** Reads the post's page: one request, for Instagram a second one on the embed page if the first has no caption. */
export async function readSocialPage(e: Detection): Promise<{ page: SocialPage } | Failure> {
  const url = socialPageUrl(e);
  if (!url || !isPublicAddress(url)) return pageFailure(tr("socialNoRead"), false);
  const urls = e.kind === "instagram" ? [url, instagramEmbedUrl(url)] : [url];
  let error = tr("socialNoRead");
  let unreachable = false;
  for (const u of urls) {
    const r = await loadPage(u, socialHeaders(e.kind));
    if ("error" in r) {
      error = r.error;
      unreachable = !!r.unreachable;
    } else {
      const page = parseSocialPage(e.kind, r.html, postId(e));
      if (page) return { page };
      // A page that answered but holds no caption is not a network failure, whatever came before.
      error = tr("socialNoRead");
      unreachable = false;
    }
  }
  // Never an empty note: say what happened and what the user can do (the formats change without notice).
  return pageFailure(error, unreachable);
}

/**
 * A link in the post to a recipe website with schema.org data: the note comes from that page, and its source is
 * that page (the note format has no field for a second link). An already saved page stops the import.
 */
async function tryLink(c: SocialContext, link: string): Promise<{ result: LinkTry; saved?: Saved }> {
  const target = detectSource(link);
  if (target.kind !== "webseite" || !target.url || !isPublicAddress(target.url)) return { result: { noData: true } };
  if (findDuplicate(target, c.recipes)) return { result: { duplicate: target.url } };
  const r = await importLocally(c.app, c.folder, target.url, c.extraProperties, c.format);
  if (r.status === "gespeichert") return { result: { saved: true }, saved: r };
  return { result: r.status === "keinSchema" ? { noData: true } : { error: r.message, technical: !!r.unreachable } };
}

type Text = { recipe: SchemaRecipe; how: "rules" | "ai" } | { error: string; why: FailReason };

/**
 * The recipe in the post's text: offline rules (`rules`, already read by the caller with the caption rules), or the
 * own AI. A caption that only announces a recipe elsewhere ("in the bio", on a website, in a comment) gives the hint
 * instead (src/caption.ts, the same check as for pasted text in src/main.ts).
 */
async function recipeFromPost(c: SocialContext, page: SocialPage, rules: SchemaRecipe | undefined): Promise<Text> {
  const text = socialText(page);
  const hint = missingRecipeHint(text, !!rules, !!c.ai);
  if (hint) return { error: tr(hint), why: "noRecipe" };
  if (c.ai) {
    const r = await recipeWithAi(c.ai.settings, c.ai.key, { text }, c.format);
    if ("error" in r) return { error: r.error, why: r.technical ? "technical" : "noRecipe" };
    return { recipe: r.recipe, how: "ai" };
  }
  return hasRecipeParts(rules) ? { recipe: rules, how: "rules" } : { error: tr("textNoRecipe"), why: "noRecipe" };
}

/**
 * Imports a post. The caption comes first: if it holds ingredients and steps, it is the recipe and no link is
 * followed. Otherwise up to three links in the post are tried in order (the first website with schema.org data
 * wins; the note's source is then that website), and last the caption's text.
 */
export async function importSocial(c: SocialContext, e: Detection): Promise<SocialResult> {
  const read = await readSocialPage(e);
  if (!("page" in read)) return failed(read);
  const { page } = read;
  const rules = page.text ? recipeFromText(socialText(page), { caption: true }) : undefined;
  const tries: LinkTry[] = [];
  for (const link of socialPlan(page, rules, c.followLinks).links) {
    const t = await tryLink(c, link);
    if (t.saved) return { ok: true, saved: t.saved, how: "website" };
    tries.push(t.result);
    if (stopsAfter(t.result)) return failed(socialFailure(tries, "none"));
  }
  if (!page.text) return failed(socialFailure(tries, "none"));
  const r = await recipeFromPost(c, page, rules);
  if ("error" in r) return failed(socialFailure(tries, { error: r.error, why: r.why }));
  const saved = await saveRecipe(
    c.app,
    c.folder,
    { ...r.recipe, author: r.recipe.author ?? page.author },
    {
      source: e.url,
      coverUrl: page.image,
      extraProperties: c.extraProperties,
      format: c.format,
      fromText: true,
      job: c.job,
    },
  );
  return { ok: true, saved, how: r.how, ...(c.job ? { firstVersion: true as const } : {}) };
}
