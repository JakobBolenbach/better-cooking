// Are two texts of list entries (ingredients, steps) the same entry, edited? Shared by the recipe editor (src/sectionDiff.ts)
// and the carrying over of ingredients lines to a new version of the steps (src/stepIngredients.ts). Pure.

/** Words that tell items apart: letters only, no amounts and no units ("2 EL Öl" is "öl"). */
const UNITS = new Set(
  "g kg mg l ml dl cl el tl prise prisen stück stk pck pkg pck packung dose dosen glas bund zehe zehen scheibe scheiben tbsp tsp cup cups oz lb pinch can cans clove cloves slice slices piece pieces".split(
    " ",
  ),
);
export const wordsIn = (text: string): string[] =>
  (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => !UNITS.has(w));

/**
 * Is a new text an edit of an old one? They share at least half of the words of the shorter one (amounts and units
 * left out); with no words on either side (only numbers) they do, an empty old text is edited by anything.
 */
export function similarText(oldText: string, newText: string): boolean {
  if (!oldText.trim()) return true;
  const [a, b] = [wordsIn(oldText), wordsIn(newText)];
  if (!a.length || !b.length) return a.length === b.length;
  const shared = new Set(a.filter((w) => b.includes(w))).size;
  return shared >= Math.ceil(Math.min(new Set(a).size, new Set(b).size) / 2);
}
