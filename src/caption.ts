// Prepares the caption of a social media post for the text rules in textRecipe.ts (issue #88, ADR 0005): removes the
// Instagram prefix, hashtag and mention lines and surrounding quotes, turns number and bullet emoji into list
// markers, puts headings that stand inside a line ("Zutaten: 200 g Mehl, 1 Ei") on their own line and breaks
// one-line captions into ingredient lines and sentences. Also recognizes captions whose recipe is not in the text.
// Pure functions without Obsidian, tested in tests/caption.test.ts. The text is untrusted; recipeNote neutralizes it.

import { splitQuantity } from "./quantities";
import { splitSentences } from "./sentences";
import type { Key } from "./i18n";

// "1.234 likes, 56 comments - user on March 3, 2026:" and "1.234 „Gefällt mir“-Angaben, 56 Kommentare - user am 3. März 2026:"
const INSTAGRAM_PREFIX =
  /^\s*[\d.,\s]+[kKmM]?\s*(?:likes?|[„"“”]?Gefällt mir[“"”]?(?:-Angaben)?)\s*(?:,\s*[\d.,]+[kKmM]?\s*(?:comments?|Kommentare?))?\s*[-–—]\s*\S[^\n]{0,80}?\s+(?:on|am)\s+[^:\n]{3,30}?\d{4}\s*:\s*/u;
const QUOTES = /^["„“”'«»]|["“”'«»]$/g;
const KEYCAP = /([0-9])️?⃣/gu;
const EMOJI = String.raw`\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*`;
const LEADING_EMOJI = new RegExp(String.raw`^\s*(?:${EMOJI}\s*)+`, "u");
const HEADING =
  /(^|[\s.!?,;])((?:zutaten|ingredients?|zubereitung|anleitung|schritte|method|instructions|directions|steps|preparation)(?:\s*\((?:für|for)\s+[^)\n]{1,30}\)|\s+(?:für|for)\s+[^:：\n]{1,30})?)\s*[:：][ \t]*/gimu;

/** "Zutaten für 4 Personen:" → "4 Personen", for the yield; undefined without a number. */
export function headingYield(line: string): string | undefined {
  const m = /^(?:zutaten|ingredients?)\s+(?:für|for)\s+(.+?)\s*[:：]?$/iu.exec(line.trim());
  return m && /\d/.test(m[1]) ? m[1] : undefined;
}

const MARKER = /^[-•·▪◦‣]\s|^\d{1,2}[.)]\s/;
const hashtagOnly = (l: string) => /^(?:\s*[#@]\p{L}[\p{L}\p{N}_.-]*)+\s*$/u.test(l);

/**
 * Hashtags: lines of only hashtags or mentions go, a trailing run of them goes, "#Pasta" inside a sentence keeps the
 * word ("Heute gibt es #Pasta" reads as a sentence, a deleted word would leave a hole); "#1" and "# Titel" stay.
 */
function withoutTags(line: string): string {
  return line.replace(/(?:\s+[#@]\p{L}[\p{L}\p{N}_.]*)+\s*$/u, "").replace(/(^|\s)#(?=\p{L})/gu, "$1");
}

/** Breaks "200 g Mehl, 1 Ei, 100 ml Milch" into lines; a part without an amount belongs to the part before it ("1 Zwiebel, fein gehackt"). */
function ingredientList(text: string): string[] | undefined {
  const parts = text
    .replace(/[.!]+$/, "")
    .split(/\s*[,;•·]\s*|\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (splitQuantity(p).amount !== undefined || !out.length) out.push(p);
    else out[out.length - 1] += `, ${p}`;
  }
  const counted = out.filter((p) => splitQuantity(p).amount !== undefined).length;
  return counted >= 2 && counted >= Math.ceil(out.length * 0.6) && out.length <= 40 ? out : undefined;
}

/** A sentence of a one-line caption: an ingredient list (also after "Name:") is broken up, other text stays. */
function expandSentence(sentence: string): string[] {
  // "Cremige Nudeln: 250 g Pasta, 100 ml Sahne, 1 Knoblauchzehe" → title and list
  const titled = /^([^:：\d]{2,60}?)\s*[:：]\s+(.+)$/u.exec(sentence);
  const rest = titled && ingredientList(titled[2]);
  if (titled && rest && rest.length >= 3) return [titled[1], ...rest];
  const list = ingredientList(sentence);
  return list && list.length >= 3 ? list : [sentence];
}

// "Lemon rice (serves 4)" / "Pasta | für 2 Personen": the yield at the end of the title line gets its own line.
const TRAILING_YIELD = /\s*[(|–-]\s*((?:für|for|serves|makes|ergibt)\s+\d[^()|.\n]{0,20}?)\)?\s*$/iu;

/** The caption as lines the text rules understand. Normal recipe texts come out unchanged except for emoji markers. */
export function cleanCaption(text: string): string {
  let t = text.replace(/\r\n?/g, "\n").replace(INSTAGRAM_PREFIX, "");
  t = t.trim();
  if (/^["„“”«»]/.test(t) && /["“”«»]$/.test(t)) t = t.replace(QUOTES, "").trim();
  t = t
    .replace(KEYCAP, "$1.")
    .replace(/\u{1F51F}/gu, "10.")
    .replace(HEADING, (m, pre: string, word: string) => {
      // Inside a line only a capitalized word is a heading ("3 simple steps: mix" is not).
      const lineStart = pre === "" || pre === "\n";
      if (!lineStart && !/^\p{Lu}/u.test(word)) return m;
      const h = word.replace(/\s*\(((?:für|for)\s+[^)]+)\)/iu, " $1");
      return `${pre}\n${h}:\n`;
    });
  const lines = t
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !hashtagOnly(l))
    .map(withoutTags)
    .filter(Boolean)
    .map((l) => l.replace(LEADING_EMOJI, "- ").replace(/^-\s+(?=\d{1,2}[.)]\s)/, ""));
  const out: string[] = [];
  const headings = (l: string) => /[:：]$/.test(l) && l.length < 40;
  const flat = lines.filter((l) => !headings(l)).length <= 2;
  let section = "";
  for (const l of lines) {
    if (headings(l)) {
      section = /^(zutaten|ingredients?)\b/i.test(l) ? "ingredients" : "other";
      out.push(l);
    } else if (MARKER.test(l)) out.push(l);
    else if (section === "" && !out.length && TRAILING_YIELD.test(l)) {
      const m = TRAILING_YIELD.exec(l)!;
      out.push(l.slice(0, m.index), m[1]);
    } else if (section === "ingredients") out.push(...(ingredientList(l) ?? [l]));
    else if (section === "" && flat) out.push(...splitSentences(l).flatMap(expandSentence));
    else out.push(l);
  }
  return out.join("\n");
}

// "Recipe in bio": the recipe is not in the text. The result is a string key; the caller shows it instead of an empty note.
const BIO =
  /\b(?:rezept|recipe)\b[^.!?\n]{0,30}\b(?:in|im|auf|on|at)\s+(?:der|dem|meiner|meinem|meinen|my|the)?\s*(?:bio|profil|profile)\b|\b(?:link|links)\s+(?:in|im|auf|on)\s+(?:der|dem|meiner|meinem|my|the)?\s*(?:bio|profil|profile)\b/iu;
const SITE =
  /\b(?:rezept|recipe)\b[^.!?\n]{0,40}\b(?:auf|bei|on|at)\s+(?:der|dem|meiner|meinem|meinen|my|the|unserer|unserem|our)?\s*(?:blog|website|webseite|homepage|seite|site)\b/iu;
const COMMENT =
  /\b(?:kommentier\w*|schreib\w*|comment|dm|pn)\b[^.!?\n]{0,40}["„“”'‘]?\b(?:rezept|recipe)\b|\b(?:rezept|recipe)\b[^.!?\n]{0,30}\b(?:per|via|by)\s+(?:dm|pn|kommentar|comment)\b/iu;

/** Why a caption has no recipe although it announces one; undefined when no such hint is in the text. */
export function captionHint(
  text: string,
): Extract<Key, "captionInBio" | "captionOnSite" | "captionComment"> | undefined {
  if (BIO.test(text)) return "captionInBio";
  if (SITE.test(text)) return "captionOnSite";
  if (COMMENT.test(text)) return "captionComment";
  return undefined;
}
