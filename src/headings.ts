// The heading words of pasted recipe texts ("Zutaten", "Ingredients", "Zubereitung", "Method" …) in one place, used by the
// text rules (textRecipe.ts) and the caption preparation (caption.ts). Pure functions, tested in tests/textRecipe.test.ts.

export type Section = "ingredients" | "steps" | "tips";

/** Pattern sources for the heading words, to build further patterns from them. */
export const INGREDIENT_WORDS = "zutaten|ingredients?|you(?:'| wi)ll need|was du brauchst";
export const STEP_WORDS = "zubereitung|schritte|anleitung|so geht'?s|steps|instructions|directions|method|preparation";
const TIP_WORDS = "tipps?|hinweise?|notes?|tips?";

/** One emoji, with variation selectors and joiners ("➡️", "👨‍🍳"). */
export const EMOJI = String.raw`\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*`;

// "Zutaten für 4 Personen" and "Zutaten (for 4)" count too; the group after "für" is the yield.
const INGREDIENTS = new RegExp(`^(?:${INGREDIENT_WORDS})(?:\\s*\\(?(?:für|for)\\b\\s*(.*?)\\)?)?$`, "i");
const STEPS = new RegExp(`^(?:${STEP_WORDS})$`, "i");
const TIPS = new RegExp(`^(?:${TIP_WORDS})$`, "i");
const LEAD_MARKS = new RegExp(`^(?:[#*_\\s]|${EMOJI})+`, "u");

/** The words of a heading line without "##", "**", "__", an emoji in front and the colon behind; "" for a long line. */
function headingText(line: string): string {
  if (line.length > 80) return "";
  const t = line
    .replace(LEAD_MARKS, "")
    .replace(/[*_\s]*[:：]?[*_\s]*$/, "")
    .trim();
  return t.length > 40 ? "" : t;
}

/** A heading line: short, all one of the known words; "## Zutaten:", "**Zutaten:**" and "🛒 Zutaten" count. */
export function heading(line: string): Section | undefined {
  const t = headingText(line);
  if (INGREDIENTS.test(t)) return "ingredients";
  if (STEPS.test(t)) return "steps";
  if (TIPS.test(t)) return "tips";
  return undefined;
}

/** "Zutaten für 4 Personen:" → "4 Personen"; undefined without a number. */
export function headingYield(line: string): string | undefined {
  const tail = INGREDIENTS.exec(headingText(line))?.[1]?.trim();
  return tail && /\d/.test(tail) ? tail : undefined;
}
