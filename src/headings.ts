// The heading words of recipe texts ("Zutaten", "Ingredients", "Zubereitung", "Method" …) and the "für 4 Personen" addition
// to them in one place, used by the text rules (textRecipe.ts) and the caption preparation (caption.ts).
// Pure functions, tested in tests/textRecipe.test.ts and tests/caption.test.ts.

export type Section = "ingredients" | "steps" | "tips";

/** Pattern sources for the heading words, to build further patterns from them. */
export const INGREDIENT_WORDS = "zutaten|ingredients?|you(?:'| wi)ll need|was du brauchst";
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
