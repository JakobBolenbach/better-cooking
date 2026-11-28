// Explicit ingredients of a step (ADR 0009, issue #162): an indented line directly under the step,
// `   - Zutaten: Eiweiß, Salz (Glasur)` or `   - Ingredients: …`. Reading the line, resolving its items to the
// ingredient lines of the recipe, and the ingredients of a step for cooking mode (explicit list or guessing).
// Pure functions without Obsidian, tested in tests/stepIngredients*.test.ts.
import { ingredientsInStep, isEquipment } from "./cooking";
import { normalize } from "./ingredientWords";
import { cleanItem, unescapeLead } from "./lineEscape";
import type { NoteLang } from "./noteFormat";
import { ingredientName, splitQuantity } from "./quantities";
import { nameKey, type Hit } from "./stepFilter";
import type { IngredientGroup, Step, StepRef } from "./types";

/** The line under a step: indented bullet, keyword in either language, colon, items. */
const LINE = /^\s+[-*]\s+(?:Zutaten|Ingredients)\s*:\s*(.*)$/i;

/** The words of "no ingredients in this step" ("Zutaten: keine"). */
const NONE = /^(?:keine|none)\.?$/i;

/** The keyword the plugin writes, in the language of the note. */
export const STEP_INGREDIENTS_WORD: Record<NoteLang, string> = { de: "Zutaten", en: "Ingredients" };

/** The items of a line under a step; undefined if it is none; an empty list for "no ingredients" (also `Zutaten:` alone). */
export function readIngredientLine(line: string): string[] | undefined {
  const m = LINE.exec(line);
  if (!m) return undefined;
  const value = m[1].trim();
  return NONE.test(value) ? [] : splitItems(value);
}

/** Items of the written list: separated by commas outside of brackets ("Salz (Glasur, fein)" stays one item). */
export function splitItems(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of value) {
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => unescapeLead(cleanItem(s))).filter(Boolean);
}

/** The steps of a read recipe as data for a writer (import data, translation): the items of a step as written. */
export const stepsAsData = (steps: readonly Step[]) =>
  steps.map((s) => ({
    ...(s.title ? { title: s.title } : {}),
    text: s.text,
    ...(s.ingredients ? { ingredients: s.ingredients.map((x) => x.text) } : {}),
  }));

/** The items as the editor shows them: one text, separated by commas. */
export const joinItems = (items: string[]): string => items.join(", ");

/** Items as written in the line: one line each, no comma outside of brackets (it would split the item). */
export const writableItem = (s: string): string => cleanItem(s).replace(/\s*,\s*/g, " ");

/** The whole line for the note (`indent` is the start of the line); undefined without items. */
export function ingredientLine(items: string[], lang: NoteLang, indent = "   - "): string | undefined {
  const list = items.map(writableItem).filter(Boolean);
  return list.length ? `${indent}${STEP_INGREDIENTS_WORD[lang]}: ${joinItems(list)}` : undefined;
}

/** Do two lists name the same items (whitespace aside)? "none" and an empty list are the same. */
export const sameItems = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => cleanItem(x) === cleanItem(b[i]));

// ------------------------------------------------------------------ Resolving

const words = (s: string) =>
  normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Groups whose title the bracket names (equal, or one contains the other as whole words); empty if none does. */
function groupsNamed(label: string, groups: IngredientGroup[]): number[] {
  const l = words(label).join(" ");
  if (l.length < 3) return [];
  const exact = groups.flatMap((g, i) => (words(g.title ?? "").join(" ") === l ? [i] : []));
  if (exact.length) return exact;
  return groups.flatMap((g, i) => {
    const t = ` ${words(g.title ?? "").join(" ")} `;
    return t.trim() && (t.includes(` ${l} `) || ` ${l} `.includes(t)) ? [i] : [];
  });
}

/**
 * One written item as a reference: a bracket at the end that names a group of the recipe is the group, an amount at the
 * start is the item's own amount (a part of the ingredient: "285 g Wasser"). The ingredient lines of that name (the
 * name key of the list, `nameKey`) in the named groups, or in all groups without equipment; none: the item is shown as written.
 */
export function resolveItem(item: string, groups: IngredientGroup[]): StepRef {
  let text = item.trim();
  let only: number[] = [];
  const bracket = /\s*\(([^()]*)\)\s*$/.exec(text);
  if (bracket) {
    only = groupsNamed(bracket[1], groups);
    if (only.length) text = text.slice(0, bracket.index).trim();
  }
  const own = splitQuantity(text).amount !== undefined;
  const key = nameKey(own ? splitQuantity(text).rest : text);
  const hits: Hit[] = [];
  if (key)
    groups.forEach((g, group) => {
      if (isEquipment(g.title) || (only.length && !only.includes(group))) return;
      g.ingredients.forEach((z, index) => ingredientName(z) && nameKey(z) === key && hits.push({ group, index }));
    });
  return { text: item.trim(), hits, ...(own ? { own: true } : {}) };
}

export const resolveItems = (items: string[], groups: IngredientGroup[]): StepRef[] =>
  items.map((i) => resolveItem(i, groups));

// ------------------------------------------------------------------ For cooking mode

/** Has at least one step an explicit list? Then the recipe is explicit: a step without a line has no ingredients. */
export const isExplicit = (steps: readonly Pick<Step, "ingredients">[]): boolean =>
  steps.some((s) => s.ingredients !== undefined);

export interface StepIngredients {
  /** Ingredient lines of the list, to be shown scaled as they are. */
  hits: Hit[];
  /** Lines to show as written: an item with its own amount (scaled like a line) or one that is no ingredient of the list. */
  extra: string[];
}

/** The ingredients of step `i`: the explicit list if the recipe has one, else guessed from the words of the step. */
export function ingredientsOfStep(
  r: { steps: readonly Step[]; ingredients: IngredientGroup[] },
  i: number,
): StepIngredients {
  const s = r.steps[i];
  if (!s) return { hits: [], extra: [] };
  if (isExplicit(r.steps)) {
    const refs = s.ingredients ?? [];
    const key = (h: Hit) => `${h.group}-${h.index}`;
    const seen = new Set<string>();
    const hits = refs
      .filter((x) => !x.own)
      .flatMap((x) => x.hits)
      .filter((h) => !seen.has(key(h)) && !!seen.add(key(h)));
    return { hits, extra: refs.filter((x) => x.own || !x.hits.length).map((x) => x.text) };
  }
  return { hits: ingredientsInStep(`${s.title ?? ""} ${s.text}`, r.ingredients), extra: [] };
}
