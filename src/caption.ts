// Prepares the caption of a social media post for the text rules in textRecipe.ts (issue #88, ADR 0005).
// Two levels, so that normal pasted recipe texts stay as they are:
//  - safe rules, always: Instagram prefix, lines of only hashtags or mentions, number and bullet emoji as list markers;
//  - caption rules, with `{ caption: true }` (the social media import, #87) or when the text is clearly a caption (Instagram
//    prefix, a hashtag block, number emoji): quotes around the caption, tags at the end of a line, headings inside a line
//    ("Zutaten: 200 g Mehl, 1 Ei"), ingredient lists and sentences of one-line captions.
// Also recognizes captions whose recipe is not in the text. Pure functions without Obsidian, tested in tests/caption.test.ts.
// The text is untrusted; recipeNote neutralizes it.

import { splitQuantity } from "./quantities";
import { looksEnglish, splitSentences } from "./sentences";
import { isAction } from "./stepTitle";
import { EMOJI, INGREDIENT_WORDS, STEP_WORDS, heading, type Section } from "./headings";
import type { Key } from "./i18n";

export interface CaptionOptions {
  /** The text is the caption of a social media post: apply the caption rules whatever it looks like. */
  caption?: boolean;
}

/** Longest text that is read (like the processors); the rest is ignored. */
const MAX_LENGTH = 20000;

// "1.234 likes, 56 comments - user on March 3, 2026:" and "1.234 „Gefällt mir“-Angaben, 56 Kommentare - user am 3. März 2026:"
const INSTAGRAM_PREFIX =
  /^[\d.,]+[kKmM]?\s*(?:likes?|[„"“”]?Gefällt mir[“"”]?(?:-Angaben)?)\s*(?:,\s*[\d.,]+[kKmM]?\s*(?:comments?|Kommentare?))?\s*[-–—]\s*\S[^\n]{0,80}?\s+(?:on|am)\s+[^:\n]{3,30}?\d{4}\s*:\s*/u;
const QUOTES = /^["„“”'«»]|["“”'«»]$/g;
const KEYCAP = /([0-9])️?⃣/gu;
const LEADING_EMOJI = new RegExp(String.raw`^\s*(?:${EMOJI}\s*)+`, "u");
const MARKER = /^[-•·▪◦‣]\s|^\d{1,2}[.)]\s/;
const TAG = /^[#@]\p{L}[\p{L}\p{N}_.]*$/u;
const hashtagOnly = (l: string) => l.length > 1 && l.split(/\s+/).every((w) => TAG.test(w));

// "Zutaten:" and "Zubereitung:" inside a line, with "##", "**" or "(für 4 Personen)" around them.
const INLINE_HEADING = new RegExp(
  String.raw`(?:^([ \t#*_]*)|([\s.!?,;|]))((?:${INGREDIENT_WORDS}|${STEP_WORDS})(?:\s*\((?:für|for)\s+[^)\n]{1,30}\)|\s+(?:für|for)\s+[^:：\n]{1,30})?)[*_]*\s*[:：][*_]*[ \t]*`,
  "gimu",
);
/** After the heading only a time or a number ("Zubereitung: 20 Min."): it is a fact of the recipe, not a heading. */
const ONLY_TIME =
  /^\s*(?:ca\.\s*|~\s*)?\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+)?\s*(?:min(?:uten|utes|s)?|std|stunden?|h|hrs?|hours?|sek|sec|tage?|days?)?\.?\s*$/i;
const TIME_AMOUNT = /^(?:ca\.\s*)?\d+(?:[.,]\d+)?\s*(?:min|minuten?|minutes?|std|stunden?|h|hours?|sek|sec|°|grad)\b/i;
const BARE_INGREDIENTS = /^(?:salz|pfeffer|zucker|wasser|öl|mehl|butter|salt|pepper|sugar|water|oil|flour)\b/i;
const YIELD_HEAD = /^(?:für|for|serves|makes|ergibt)\b/i;

/** A caption for sure: Instagram prefix, a block of hashtags or number emoji. */
function looksLikeCaption(raw: string, lines: string[]): boolean {
  return (
    KEYCAP.test(raw) ||
    /\u{1F51F}/u.test(raw) ||
    lines.some(hashtagOnly) ||
    (raw.match(/(?:^|\s)#\p{L}/gu)?.length ?? 0) >= 3
  );
}

/** Tags at the end of a line go, "#Pasta" inside a sentence keeps the word; "#1" and "# Titel" stay. Linear in the line. */
function withoutTags(line: string): string {
  const words = line.split(" ");
  let end = words.length;
  while (end > 1 && TAG.test(words[end - 1])) end--;
  return words
    .slice(0, end)
    .join(" ")
    .replace(/(^| )#(?=\p{L})/gu, "$1");
}

/** An ingredient part: has an amount that is no time and no verb. */
const ingredient = (p: string) => splitQuantity(p).amount !== undefined && !TIME_AMOUNT.test(p);

/** Splits at commas and dashes, but not inside numbers ("1,5 l", "2 - 3 EL"). */
function parts(text: string): string[] {
  const out: string[] = [];
  let pos = 0;
  for (const m of text.matchAll(/\s*[,;•·]\s*|\s+[-–—]\s+/g)) {
    const digits = /\d/.test(text[m.index - 1] ?? "") && /\d/.test(text[m.index + m[0].length] ?? "");
    if (digits && (m[0] === "," || /[-–—]/.test(m[0]))) continue;
    out.push(text.slice(pos, m.index));
    pos = m.index + m[0].length;
  }
  out.push(text.slice(pos));
  return out.map((p) => p.trim()).filter(Boolean);
}

/**
 * "200 g Mehl, 1,5 l Milch, Parmesan" → lines; undefined unless at least `min` parts have an amount. A lower case part
 * without an amount ("fein gehackt") belongs to the part before it, a capitalized one ("Parmesan") is an ingredient.
 */
function ingredientList(text: string, min: number): string[] | undefined {
  const en = looksEnglish(text);
  const items: string[] = [];
  for (const p of parts(text.replace(/[.!]+$/, ""))) {
    if (!ingredient(p) && isAction(p, en)) return undefined;
    const glue = items.length && !ingredient(p) && /^\p{Ll}/u.test(p) && !BARE_INGREDIENTS.test(p);
    if (glue) items[items.length - 1] += `, ${p}`;
    else items.push(p);
  }
  const counted = items.filter(ingredient).length;
  return counted >= min && counted >= Math.ceil(items.length * 0.6) && items.length <= 40 ? items : undefined;
}

/** A sentence of a one-line caption: an ingredient list (also after "Name:" or "Für 4 Personen:") is broken up. */
function expandSentence(sentence: string): string[] {
  const titled = /^([^:：]{2,60}?)\s*[:：]\s+(.+)$/u.exec(sentence);
  if (titled && (!/\d/.test(titled[1]) || YIELD_HEAD.test(titled[1]))) {
    const rest = ingredientList(titled[2], 3);
    if (rest) return [titled[1], ...rest];
  }
  return ingredientList(sentence, 3) ?? [sentence];
}

// "Lemon rice (serves 4)" / "Pasta | für 2 Personen": the yield at the end of the title line gets its own line.
const TRAILING_YIELD = /\s*[(|–-]\s*((?:für|for|serves|makes|ergibt)\s+\d[^()|.\n]{0,20}?)\)?\s*$/iu;

/** Puts a heading inside a line on its own line: "… rühren. Zubereitung: Backen" → "… rühren.\nZubereitung:\nBacken". */
function splitHeadings(t: string): string {
  return t.replace(
    INLINE_HEADING,
    (m, start: string | undefined, mid: string | undefined, word: string, offset: number) => {
      // Inside a line only a capitalized word is a heading ("3 simple steps: mix" is not).
      if (start === undefined && mid !== "\n" && !/^\p{Lu}/u.test(word)) return m;
      if (ONLY_TIME.test(t.slice(offset + m.length).split(/[|\n]/, 1)[0])) return m;
      const h = word.replace(/\s*\(((?:für|for)\s+[^)]+)\)/iu, " $1");
      return `${mid && /[.!?]/.test(mid) ? mid : ""}\n${h}:\n`;
    },
  );
}

/** The caption as lines the text rules understand; see the top of the file for the two levels. */
export function cleanCaption(text: string, options: CaptionOptions = {}): string {
  const raw = text.slice(0, MAX_LENGTH).replace(/\r\n?/g, "\n").trim();
  const prefix = INSTAGRAM_PREFIX.exec(raw.slice(0, 300));
  let t = prefix ? raw.slice(prefix[0].length).trim() : raw;
  if (prefix && /^["„“”«»]/.test(t) && /["“”«»]$/.test(t)) t = t.replace(QUOTES, "").trim();
  const all = t.split("\n").map((l) => l.trim());
  const caption = !!options.caption || !!prefix || looksLikeCaption(raw, all);
  if (caption) t = splitHeadings(t.replace(/[ \t]+/g, " "));
  const lines = t
    .replace(KEYCAP, "$1.")
    .replace(/\u{1F51F}/gu, "10.")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !hashtagOnly(l))
    .map((l) => (caption ? withoutTags(l) : l))
    .filter(Boolean)
    .map((l) => {
      const plain = l.replace(LEADING_EMOJI, "");
      if (plain === l) return l;
      return heading(plain) ? plain : `- ${plain}`.replace(/^-\s+(?=\d{1,2}[.)]\s)/, "");
    });
  if (!caption) return lines.join("\n");
  const out: string[] = [];
  const flat = lines.filter((l) => !heading(l)).length <= 2;
  let section: Section | undefined;
  for (const l of lines) {
    const h = heading(l);
    if (h) {
      section = h;
      out.push(l);
    } else if (MARKER.test(l)) out.push(l);
    else if (!section && !out.length && TRAILING_YIELD.test(l)) {
      const m = TRAILING_YIELD.exec(l)!;
      out.push(l.slice(0, m.index), m[1]);
    } else if (section === "ingredients") out.push(...(ingredientList(l, 2) ?? [l]));
    else if (!section && flat) out.push(...splitSentences(l).flatMap(expandSentence));
    else out.push(l);
  }
  return out.join("\n");
}

// "Recipe in bio": the recipe is not in the text. The result is a string key; the caller shows it instead of an empty note.
const BIO =
  /\b(?:rezept|recipe)\b[^.!?\n]{0,30}\b(?:in|im|auf|on|at)\s+(?:der|dem|meiner|meinem|meinen|my|the)?\s*(?:bio|profil|profile)\b|\b(?:link|links)\s+(?:in|im|auf|on)\s+(?:der|dem|meiner|meinem|my|the)?\s*(?:bio|profil|profile)\b/iu;
const SITE =
  /\b(?:rezept|recipe)\b[^.!?\n]{0,40}\b(?:auf|bei|on|at)\s+(?:der|dem|meiner|meinem|meinen|my|the|unserer|unserem|our)?\s*(?:blog|website|webseite|homepage|seite|site)\b/iu;
// A real request: a verb and the keyword in quotes or in capitals ("Kommentiere REZEPT"), or a promise to send it.
const REQUEST_VERB = String.raw`(?:[Kk]ommentier\w*|[Ss]chreib\w*|[Cc]omment|[Dd][Mm]|[Pp][Nn]|[Ww]rite|[Tt]ype|[Ss]end me)`;
const COMMENT_CAPS = new RegExp(String.raw`${REQUEST_VERB}\b[^.!?\n]{0,40}\b(?:REZEPT|RECIPE)\b`);
const COMMENT_QUOTED = new RegExp(
  String.raw`${REQUEST_VERB}\b[^.!?\n]{0,40}["„“”'‘]\s*(?:rezept|recipe)\s*["“”'’]`,
  "i",
);
const PROMISE =
  /\b(?:rezept|recipe)\b[^.!?\n]{0,60}\b(?:schick\w*\s+(?:ich\s+)?(?:dir|euch)|I['’]ll\s+(?:DM|send|message)|ich\s+sende)\b|\b(?:schick\w*\s+(?:ich\s+)?(?:dir|euch)|I['’]ll\s+(?:DM|send|message)|ich\s+sende)\b[^.!?\n]{0,60}\b(?:rezept|recipe)\b/i;

/** Why a caption has no recipe although it announces one; undefined when no such hint is in the text. */
export function captionHint(
  text: string,
): Extract<Key, "captionInBio" | "captionOnSite" | "captionComment"> | undefined {
  const t = text.slice(0, MAX_LENGTH);
  if (BIO.test(t)) return "captionInBio";
  if (SITE.test(t)) return "captionOnSite";
  if (COMMENT_CAPS.test(t) || COMMENT_QUOTED.test(t) || PROMISE.test(t)) return "captionComment";
  return undefined;
}
