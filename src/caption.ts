// Prepares the caption of a social media post for the text rules in textRecipe.ts (issue #88, ADR 0005).
// Two levels, so that normal pasted recipe texts stay as they are:
//  - safe rules, always: Instagram prefix, lines of only hashtags or mentions, number and bullet emoji as list markers;
//  - caption rules, with `{ caption: true }` (the social media import, #87) or when the text is clearly a caption (Instagram
//    prefix, a hashtag block, number emoji): quotes around the caption, tags at the end of a line, headings inside a line
//    ("Zutaten: 200 g Mehl, 1 Ei"), ingredient lists and sentences of one-line captions.
// Also recognizes captions whose recipe is not in the text. Pure functions without Obsidian, tested in tests/caption.test.ts.
// The text is untrusted; recipeNote neutralizes it.

import { YIELD_WORDS, splitQuantity } from "./quantities";
import { startsWithTime, withoutTimes } from "./cooking";
import { STATE_WORDS, normalize } from "./ingredientWords";
import { looksEnglish, splitSentences } from "./sentences";
import { isAction } from "./stepTitle";
import {
  EMOJI,
  FOR_INLINE,
  INGREDIENT_WORDS,
  NUMBERED,
  STEP_WORDS,
  heading,
  titleYield,
  type Section,
} from "./headings";
import type { Key } from "./i18n";

export interface CaptionOptions {
  /** The text is the caption of a social media post: apply the caption rules whatever it looks like. */
  caption?: boolean;
}

/** Longest text that is read (like the processors); the rest is ignored. */
const MAX_LENGTH = 20000;

// "1.234 likes, 56 comments - user on March 3, 2026:" and "1.234 „Gefällt mir“-Angaben, 56 Kommentare - user am 3. März 2026:"
/** Group 1 is the user name; also used by the page reader (src/socialPage.ts), so there is one pattern. */
export const INSTAGRAM_PREFIX =
  /^[\d.,]+[kKmM]?\s*(?:likes?|[„"“”]?Gefällt mir[“"”]?(?:-Angaben)?)\s*(?:,\s*[\d.,]+[kKmM]?\s*(?:comments?|Kommentare?))?\s*[-–—]\s*(\S[^\n]{0,80}?)\s+(?:on|am)\s+[^:\n]{3,30}?\d{4}\s*:\s*/iu;
const NUMBERED_AFTER_DASH = new RegExp(String.raw`^-\s+(?=${NUMBERED})`, "u");
const QUOTES = /^["„“”'«»]|["“”'«»]$/g;
const KEYCAP = /([0-9])️?⃣/gu;
const LEADING_EMOJI = new RegExp(String.raw`^\s*(?:${EMOJI}\s*)+`, "u");
const MARKER = new RegExp(String.raw`^(?:[-•·▪◦‣]\s|${NUMBERED})`, "u");
const TAG = /^[#@]\p{L}[\p{L}\p{N}_.]*$/u;
/** A hashtag or mention; "#Zutaten" is a heading, not a tag. */
const isTag = (w: string) => TAG.test(w) && !(w[0] === "#" && heading(w));
const hashtagOnly = (l: string) => l.length > 1 && l.split(" ").every(isTag);

// "Zutaten:" and "Zubereitung:" inside a line, with "##", "**" or "(für 4 Personen)" around them.
const INLINE_HEADING = new RegExp(
  String.raw`(?:^([ \t#*_]*)|([\s.!?,;|]))((?:${INGREDIENT_WORDS}|${STEP_WORDS})${FOR_INLINE})[*_]*\s*[:：][*_]*[ \t]*`,
  "gimu",
);
/** Labels in front of a time ("Backen:", "Ruhezeit:"): one or two words and a colon. */
const TIME_LABEL = /\p{L}+(?: \p{L}+)?:/gu;
const YIELD_HEAD = new RegExp(`^(?:${YIELD_WORDS})\\b`, "iu");
const TEMPERATURE = /^\d+(?:[.,]\d+)?\s*(?:[°º]|grad(?!\p{L})|degrees?(?!\p{L}))/iu;
// Notes about an ingredient: an amount ("to taste", "nach Belieben") or a purpose ("zum Anbraten", "for the frosting"). One list
// of the words, used at the start of a part ("to taste") and at the end of a short ingredient ("Brown sugar to taste").
const NOTE_WORDS = String.raw`to taste|nach (?:geschmack|belieben)|as needed|bei bedarf|optional|zum (?:garnieren|servieren|bestreuen|braten|anbraten|backen|kochen|frittieren|verzieren|dekorieren|einfetten|bestäuben|beträufeln|würzen|panieren)|zur (?:dekoration|garnitur|deko|verzierung)|for (?:the )?(?:serving|garnish|garnishing|frosting|icing|topping|dusting|decoration|frying|greasing|brushing|glaze|sauce|dressing|dough)`;
const TASTE = new RegExp(String.raw`^(?:${NOTE_WORDS})(?!\p{L})`, "iu");
const TASTE_END = new RegExp(String.raw`\b(?:${NOTE_WORDS})\.?$`, "iu");
const STATES = new Set([...STATE_WORDS, "juiced", "zested"].map(normalize));

/** After a heading only times and their labels ("15 Min., Backen: 25 Min.", "1 Std. 20 Min.") or a number: no heading. */
function onlyTimes(segment: string): boolean {
  if (/^\s*\d+\s*$/.test(segment)) return true;
  const rest = withoutTimes(segment).replace(TIME_LABEL, "");
  return rest !== segment && /^[\s.,;:/–-]*$/.test(rest);
}

const MAX_NOTE_WORDS = 6;

/** A short ingredient with a note ("Salz und Pfeffer nach Belieben"): an ingredient although it has a verb-like word. */
const withNote = (p: string) => p.split(" ").length <= MAX_NOTE_WORDS && TASTE_END.test(p);

/** The part states something about the ingredient before it ("fein gehackt", "to taste", "optional"), it is no ingredient itself. */
function addition(p: string): boolean {
  if (TASTE.test(p)) return true;
  return p.split(" ").every((w) => {
    const n = normalize(w.replace(/[.,;:()]+$/, ""));
    return STATES.has(n) || STATES.has(n.replace(/(?:e|en|er|es|em)$/, ""));
  });
}

/** A line of a note's own tags ("Tags: #rezept #vegan"): no sign of a caption. */
const TAGS_LABEL = /^(?:tags?|schlagw(?:ö|oe)rter|schlagwort|stichw(?:ö|oe)rter)\s*:/iu;

/**
 * Two or more hashtags at the end of the last line ("… Serve with parsley. #lemonrice #easydinner"), mentions at the very
 * end and closing quotes skipped; one "#1" does not count, nor does a "Tags:" line.
 */
function endsWithHashtags(last: string): boolean {
  const end = last.replace(/["“”«»]+$/, "").trim();
  if (TAGS_LABEL.test(end)) return false;
  const words = end.split(" ");
  let n = 0;
  for (let i = words.length - 1; i >= 0 && isTag(words[i]); i--) if (words[i][0] === "#") n++;
  return n >= 2;
}

/** A caption for sure: Instagram prefix, a block of hashtags (also at the end of the text) or number emoji. */
function looksLikeCaption(raw: string, lines: string[]): boolean {
  return (
    KEYCAP.test(raw) ||
    endsWithHashtags(lines.at(-1) ?? "") ||
    /\u{1F51F}/u.test(raw) ||
    lines.some((l) => hashtagOnly(l) && l.split(" ").length >= 2) ||
    (lines
      .filter((l) => !TAGS_LABEL.test(l))
      .join("\n")
      .match(/(?:^|\s)#\p{L}/gu)?.length ?? 0) >= 3
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
const ingredient = (p: string) => splitQuantity(p).amount !== undefined && !startsWithTime(p) && !TEMPERATURE.test(p);

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
 * "200 g Mehl, 1,5 l Milch, Parmesan" → lines. In the ingredients section (`listed`) any list is split; otherwise at least
 * three parts need an amount. A part that only states something about the one before it ("fein gehackt", "to taste")
 * belongs to it; anything else without an amount ("Parmesan", "fresh basil") is an ingredient. A part with a verb stays a
 * line of its own in a list that is known to be one, unless most parts are actions: then it is no list (undefined);
 * in a sentence (not `listed`) one such part already makes it prose.
 */
function ingredientList(text: string, listed: boolean): string[] | undefined {
  const en = looksEnglish(text);
  const items: string[] = [];
  let actions = 0;
  for (const p of parts(text.replace(/[.!]+$/, ""))) {
    const own = ingredient(p);
    if (!own && items.length && addition(p)) items[items.length - 1] += `, ${p}`;
    else if (!own && !withNote(p) && isAction(p, en)) {
      if (!listed) return undefined;
      actions++;
      items.push(p);
    } else items.push(p);
  }
  if (listed) return items.length > 1 && actions * 2 <= items.length ? items : undefined;
  const counted = items.filter(ingredient).length;
  return counted >= 3 && counted >= Math.ceil(items.length * 0.6) && items.length <= 40 ? items : undefined;
}

/** A sentence of a one-line caption: an ingredient list (also after "Name:" or "Für 4 Personen:") is broken up. */
function expandSentence(sentence: string): string[] {
  const titled = /^([^:：]{2,60}?)\s*[:：]\s+(.+)$/u.exec(sentence);
  if (titled && (!/\d/.test(titled[1]) || YIELD_HEAD.test(titled[1]))) {
    const rest = ingredientList(titled[2], false);
    if (rest) return [titled[1], ...rest];
  }
  return ingredientList(sentence, false) ?? [sentence];
}

/** A sentence or part that starts a step: a verb, not a note ("Öl zum Anbraten") and not a state ("200 g Mehl, gesiebt"). */
function startsStep(p: string, en: boolean): boolean {
  if (withNote(p) || !isAction(p, en)) return false;
  if (!ingredient(p)) return true;
  // "2 EL Öl erhitzen.": an amount in front is a step if it goes on with an action word (more than amount, unit and noun).
  const words = p.replace(/[.!]+$/, "").split(" ");
  return words.length > 3 && !STATES.has(normalize(words[words.length - 1]));
}

/**
 * The last ingredients line of a one-line caption may go on with the steps ("… fresh parsley. Cook the rice for 12
 * minutes. …", "200 g Nudeln, 1 Glas Pesto, Nudeln 10 Min. kochen, Pesto unterrühren"): from the first part that starts a
 * step on, the rest is a steps section with a heading of its own. A sentence that starts a step is kept whole, in a
 * sentence with a list only the parts from the action on are steps.
 */
function ingredientsAndSteps(line: string): string[] {
  const en = looksEnglish(line);
  const sentences = splitSentences(line, en);
  const list = (text: string) => ingredientList(text, true) ?? [text.replace(/[.!]+$/, "")];
  const stepsHeading = en ? "Steps:" : "Zubereitung:";
  for (let i = 0; i < sentences.length; i++) {
    const ps = parts(sentences[i].replace(/[.!]+$/, ""));
    const at = ps.findIndex((p, j) => (i > 0 || j > 0) && startsStep(p, en));
    if (at < 0) continue;
    const before = sentences.slice(0, i).flatMap(list);
    if (at === 0) return [...before, stepsHeading, ...sentences.slice(i)];
    return [
      ...before,
      ...list(ps.slice(0, at).join(", ")),
      stepsHeading,
      ...ps.slice(at).map((p) => `${p}.`),
      ...sentences.slice(i + 1),
    ];
  }
  return list(line);
}

/** A closing line after the recipe ("Enjoy! 😋", "Guten Appetit!"). */
const closing = (l: string) => /!\s*$|\p{Extended_Pictographic}/u.test(l);

/** Puts a heading inside a line on its own line: "… rühren. Zubereitung: Backen" → "… rühren.\nZubereitung:\nBacken". */
function splitHeadings(t: string): string {
  return t.replace(
    INLINE_HEADING,
    (m, start: string | undefined, mid: string | undefined, word: string, offset: number) => {
      // Inside a line only a capitalized word is a heading ("3 simple steps: mix" is not).
      if (start === undefined && mid !== "\n" && !/^\p{Lu}/u.test(word)) return m;
      if (onlyTimes(t.slice(offset + m.length).split(/[|\n]/, 1)[0])) return m;
      return `${mid && /[.!?]/.test(mid) ? mid : ""}\n${word}:\n`;
    },
  );
}

/**
 * The steps may follow in the last line of the ingredients: when no heading, no amount line and no other text follows
 * (only closing lines such as "Enjoy! 😋", which are dropped: they are neither ingredient nor step). Before more
 * ingredients or an explicit heading the line stays a list.
 */
const endsIngredients = (rest: string[]) => rest.every((l) => closing(l) && !heading(l) && !ingredient(l));

/** The caption rules for the lines of a caption: yield in the title line, ingredient lists and sentences become lines. */
function expandLines(lines: string[]): string[] {
  const out: string[] = [];
  const flat = lines.filter((l) => !heading(l)).length <= 2;
  let section: Section | undefined;
  for (const [i, l] of lines.entries()) {
    const h = heading(l);
    const yielded = !h && !section && !out.length ? titleYield(l) : undefined;
    if (h) {
      section = h;
      out.push(l);
    } else if (MARKER.test(l)) out.push(l);
    else if (yielded?.shorten) out.push(yielded.head, yielded.tail);
    else if (section === "ingredients") {
      if (!endsIngredients(lines.slice(i + 1))) out.push(...(ingredientList(l, true) ?? [l]));
      else return [...out, ...ingredientsAndSteps(l)];
    } else if (!section && flat) out.push(...splitSentences(l).flatMap(expandSentence));
    else out.push(l);
  }
  return out;
}

/** The caption as lines the text rules understand; see the top of the file for the two levels. */
export const cleanCaption = (text: string, options: CaptionOptions = {}) => prepareCaption(text, options).text;

/** The prepared text and whether the caption rules were applied to it. */
export function prepareCaption(text: string, options: CaptionOptions = {}): { text: string; caption: boolean } {
  // Every kind of space (no-break space, U+2000 to U+200A, U+3000 …) becomes one space, before any pattern runs.
  const raw = text
    .slice(0, MAX_LENGTH)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
  const prefix = INSTAGRAM_PREFIX.exec(raw.slice(0, 300));
  let t = prefix ? raw.slice(prefix[0].length).trim() : raw;
  if (prefix && /^["„“”«»]/.test(t) && /["“”«»]$/.test(t)) t = t.replace(QUOTES, "").trim();
  const all = t.split("\n").map((l) => l.trim());
  const caption = !!options.caption || !!prefix || looksLikeCaption(raw, all);
  if (caption) t = splitHeadings(t);
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
      return heading(plain) ? plain : `- ${plain}`.replace(NUMBERED_AFTER_DASH, "");
    });
  if (!caption) return { text: lines.join("\n"), caption };
  return { text: expandLines(lines).join("\n"), caption };
}

// "Recipe in bio": the recipe is not in the text. The result is a string key; the caller shows it instead of an empty note.
const BIO =
  /\b(?:rezept|recipe)\b[^.!?\n]{0,30}\b(?:in|im|auf|on|at)\s+(?:der|dem|meiner|meinem|meinen|my|the)?\s*(?:bio|profil|profile)(?![\p{L}\p{N}-])|\b(?:link|links)\s+(?:in|im|auf|on)\s+(?:der|dem|meiner|meinem|my|the)?\s*(?:bio|profil|profile)(?![\p{L}\p{N}-])/iu;
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

/** At least one sentence with a cooking verb ("Pasta kochen.", "Mix the flour."). */
const hasAction = (text: string) => {
  const en = looksEnglish(text);
  return splitSentences(text).some((sentence) => isAction(sentence, en));
};

/**
 * The hint to show instead of importing, or undefined: the text announces a recipe elsewhere and the rules found none
 * (`found` false). With the own AI (`ai`) a long text or one with instructions is still sent to it.
 */
export function missingRecipeHint(text: string, found: boolean, ai: boolean): ReturnType<typeof captionHint> {
  const hint = found ? undefined : captionHint(text);
  if (hint && ai && (text.length >= 300 || hasAction(text))) return undefined;
  return hint;
}
