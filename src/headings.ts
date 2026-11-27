// The heading words of recipe texts ("Zutaten", "Ingredients", "Zubereitung", "Method" …), the "für 4 Personen" addition
// to them, the numbering of steps and the yield at the end of a title line in one place, used by the text rules
// (textRecipe.ts) and the caption preparation (caption.ts).
// Pure functions, tested in tests/textRecipe.test.ts and tests/caption.test.ts.

import { YIELD_WORDS } from "./quantities";
import { isServingsWord } from "./servingsWords";

export type Section = "ingredients" | "steps" | "tips";

/** Pattern sources for the heading words, to build further patterns from them. */
export const INGREDIENT_WORDS =
  "zutaten|ingredients?|you(?:'| wi)ll need|what you need|you need|was du brauchst|du brauchst|das brauchst du|ihr braucht|einkaufsliste";
export const STEP_WORDS = "zubereitung|schritte|anleitung|so geht'?s|steps|instructions|directions|method|preparation";
const TIP_WORDS = "tipps?|hinweise?|notes?|tips?";

/** One emoji, with variation selectors and joiners ("➡️", "👨‍🍳"). */
export const EMOJI = String.raw`\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*`;

/** The addition after a heading word, "Zutaten für 4 Personen" or "Zutaten (für 4 Personen)"; for a heading inside a line (short). */
export const FOR_INLINE = String.raw`(?:\s*\((?:für|for)\s+[^)\n]{1,30}\)|\s+(?:für|for)\s+[^:：\n]{1,30})?`;
// The same for a whole heading line: the amount is the first group (in brackets) or the second.
const FOR_LINE = String.raw`(?:\s*\(\s*(?:für|for)\b\s*(.*)\)|\s+(?:für|for)\b\s*(.*))?`;

const INGREDIENTS = new RegExp(`^(?:${INGREDIENT_WORDS})${FOR_LINE}$`, "i");
const STEPS = new RegExp(`^(?:${STEP_WORDS})${FOR_LINE}$`, "i");
const TIPS = new RegExp(`^(?:${TIP_WORDS})$`, "i");
const LEAD_MARKS = new RegExp(`^(?:[#*_\\s]|${EMOJI})+`, "u");

/** The words of a heading line without "##", "**", "__", an emoji in front and the colon behind; "" for a long line. */
function headingText(line: string): string {
  if (line.length > 80) return "";
  const t = line
    .replace(LEAD_MARKS, "")
    .replace(/[*_\s]*[:：]?[*_\s]*$/, "")
    .trim();
  return t.length > 60 ? "" : t;
}

/** A heading line: short, all one of the known words; "## Zutaten:", "**Zutaten:**" and "🛒 Zutaten" count. */
export function heading(line: string): Section | undefined {
  const t = headingText(line);
  if (INGREDIENTS.test(t)) return "ingredients";
  if (STEPS.test(t)) return "steps";
  if (TIPS.test(t)) return "tips";
  return undefined;
}

const balanced = (s: string) => (s.match(/\(/g)?.length ?? 0) === (s.match(/\)/g)?.length ?? 0);

/** "Zutaten für 4 Personen:" → "4 Personen", "Zutaten (für 1 Form (26 cm))" → "1 Form (26 cm)"; undefined without a number or with a lone bracket. */
export function headingYield(line: string): string | undefined {
  const m = INGREDIENTS.exec(headingText(line));
  const tail = (m?.[1] ?? m?.[2])?.trim();
  return tail && /\d/.test(tail) && balanced(tail) ? tail : undefined;
}

/** The numbering an author wrote: "1.", "2)", "(3)" followed by a space or a letter ("1.Reis"); "1.5 EL" is none. One pattern for all rules. */
export const NUMBERED = String.raw`(?:\d{1,2}[.)]|\(\d{1,2}\))(?=\s|\p{L})`;
const NUMBERED_START = new RegExp(String.raw`^\s*${NUMBERED}`, "u");
export const isNumbered = (line: string) => NUMBERED_START.test(line);

// "Lemon rice (serves 4)", "Pasta | für 2 Personen", "Tomatensuppe für 2 Personen": the yield at the end of a title line.
const TITLE_YIELD = new RegExp(
  String.raw`^(.*?)([\s(|–,:-]*)\b((?:${YIELD_WORDS})\s+\d[^()|.\n]{0,24}?)\)?[\s.!]*$`,
  "iu",
);
// After the word: a number of at most two digits ("für 2026" is a year) or a range, then at most one word.
const AMOUNT_AFTER_WORD = /^\p{L}+\.?\s+(\d{1,2}(?:[.,]\d)?(?:\s*(?:-|–|bis|to)\s*\d{1,2})?)(?![\d.,])\s*(.*)$/u;
// "für 5 Tage", "for 2 weeks", "für 20 Min.", "2 Mal": a duration or a count of times, no yield.
const TIME_NOUN =
  /^(?:tage?n?|wochen?|nächte|nacht|monate?n?|days?|weeks?|nights?|months?|mal|times?|min\.?|minuten?|minutes?|mins?|std\.?|stunden?|hours?|hrs?|sek\.?|sekunden|seconds?)$/iu;
/** A title line is short; a longer first line is no title with a yield (and the pattern stays fast). */
const MAX_TITLE_YIELD_LINE = 200;

/**
 * The yield at the end of a title line, one rule for pasted text and captions: `head` is the title, `tail` the yield with
 * its word ("für 2 Personen"), `shorten` says that the title may lose it (a bare number, people or portions, or a bracket or
 * separator in front: "Pasta (for 4)"). "Grundteig für 12 Muffins" is a yield but keeps its title (`shorten` false);
 * durations ("für 5 Tage", "für 20 Min."), years ("für 2026") and anything longer than one word after the number are none.
 */
export function titleYield(line: string): { head: string; tail: string; shorten: boolean } | undefined {
  if (line.length > MAX_TITLE_YIELD_LINE) return undefined;
  const m = TITLE_YIELD.exec(line);
  const head = m?.[1].replace(/[\s,;:|–—-]+$/, "");
  const amount = m && AMOUNT_AFTER_WORD.exec(m[3]);
  if (!m || !head || !amount || /\s/.test(amount[2]) || TIME_NOUN.test(amount[2])) return undefined;
  return { head, tail: m[3].trim(), shorten: /[(|–,:-]/.test(m[2]) || isServingsWord(amount[2]) };
}
