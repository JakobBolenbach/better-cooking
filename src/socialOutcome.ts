// Decisions and messages of the social media import (issue #87), apart from the requests: when a linked page ends the
// import, which failure it was (`why`, decides about the fallback to a processor), and what the user is told.
// Pure functions, tested as a table in tests/socialOutcome.test.ts. The sequence of requests is in src/socialImport.ts.

import type { SchemaRecipe } from "./schemaorg";
import { captionIsRecipe, type FailReason, type RunRule } from "./socialFlow";
import { processorName } from "./processor";
import type { LocalMiss } from "./types";
import { tr } from "./i18n";

/** What came of one link in a post. */
export type LinkTry =
  { saved: true } | { duplicate: string } | { noData: true } | { error: string; technical: boolean };

/** What came of the post's text, or "none" if there was no text. */
export type TextTry = "none" | { error: string; why: FailReason };

/**
 * A failure: `message` for the user (with what they can do), `detail` the bare reason, which is what comes along when
 * a processor takes over (the processor's own message already tells what to do).
 */
export interface Failure {
  message: string;
  detail: string;
  why: FailReason;
}

/** After this link the import is over: a note was saved from it, or it is already in the collection. */
export const stopsAfter = (t: LinkTry): "saved" | "duplicate" | null =>
  "saved" in t ? "saved" : "duplicate" in t ? "duplicate" : null;

const joined = (...parts: string[]) => parts.filter(Boolean).join(" ");

/** The failure of reading the post's page; a page that could not be reached at all is technical (no fallback). */
export function pageFailure(error: string, technical: boolean): Failure {
  return { message: joined(error, tr("socialPasteHint")), detail: error, why: technical ? "technical" : "unreadable" };
}

/** Why the links gave nothing: "noRecipe" if a page had no recipe data, technical if every page failed technically. */
function linkReason(tries: LinkTry[]): FailReason {
  if (tries.some((t) => "noData" in t)) return "noRecipe";
  const errors = tries.filter((t): t is Extract<LinkTry, { error: string }> => "error" in t);
  return errors.length && errors.every((t) => t.technical) ? "technical" : "unreadable";
}

/**
 * The failure after all links and the text were tried (none of them saved a note). A duplicate comes first; the
 * reasons of the links go in front of the text's reason.
 */
export function socialFailure(tries: LinkTry[], text: TextTry): Failure {
  const dup = tries.find((t): t is { duplicate: string } => "duplicate" in t);
  if (dup) {
    const message = joined(tr("alreadySaved", { title: dup.duplicate }), tr("socialDuplicate"));
    return { message, detail: message, why: "duplicate" };
  }
  const notes = joined(
    tries.some((t) => "noData" in t) ? tr("socialLinkNoData") : "",
    ...[...new Set(tries.flatMap((t) => ("error" in t ? [t.error] : [])))],
  );
  if (text !== "none") {
    const detail = joined(notes, text.error);
    return { message: detail, detail, why: text.why };
  }
  if (!notes) return pageFailure(tr("socialNoRead"), false);
  return { message: joined(notes, tr("socialPasteHint")), detail: notes, why: linkReason(tries) };
}

/** What the plugin has of a post: a recipe needs at least ingredients or steps. */
export const hasRecipeParts = (r: SchemaRecipe | undefined): r is SchemaRecipe =>
  !!r && (r.ingredients.length > 0 || r.steps.length > 0);

/**
 * What comes of the recipe the rules or the own AI read from a post's text (#133, the one place that decides):
 *  - `none`: nothing usable; the processor gets the post (or the user the failure);
 *  - `saved`: the recipe is saved as it is, no job;
 *  - `firstVersion`: it is written at once as `import: offen` and the improvement job follows. `run` says when
 *    (src/socialFlow.ts `RunRule`): always, or only if ingredients or steps are missing.
 * Without a first version (`run` absent) a partial result of the rules goes to a processor that can take over
 * (`fallback`), as before #133; a partial result of the own AI is saved.
 */
export function textOutcome(
  recipe: SchemaRecipe | undefined,
  o: { run?: RunRule; fallback: boolean; ai: boolean },
): "none" | "saved" | "firstVersion" {
  if (!hasRecipeParts(recipe)) return "none";
  const complete = captionIsRecipe(recipe);
  if (o.run === "always" || (o.run === "partial" && !complete)) return "firstVersion";
  return !complete && o.fallback && !o.ai ? "none" : "saved";
}

/** What the user is told about a failed local reading, by the reason (`why` of `Failure`, #156). */
export const localMiss = (why: FailReason, instant: boolean): LocalMiss => ({
  why: why === "noRecipe" ? "noRecipe" : why === "technical" ? "network" : "unreadable",
  ...(instant ? { instant: true as const } : {}),
});

const MISS = {
  unreadable: "socialMissUnreadable",
  noRecipe: "socialMissNoRecipe",
  network: "socialMissNetwork",
} as const;

/**
 * The sentence for the import dialog and the card of the job: the post could not be read directly, so the processor
 * fetches it completely, which takes a few minutes (and there is no first version at once when the user expected one).
 */
export function missText(m: LocalMiss, processor: "claude" | "github"): string {
  return joined(
    tr(MISS[m.why]),
    m.instant ? tr("socialMissNoFirst") : "",
    tr("socialMissFetch", { processor: processorName(processor) }),
  );
}
