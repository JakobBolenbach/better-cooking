// Explicit ingredients of a step (ADR 0009, issue #162): an indented line directly under the step,
// `   - Zutaten: Eiweiß, Salz (Glasur)` or `   - Ingredients: …`. Reading the line, resolving its items to the
// ingredient lines of the recipe, and the ingredients of a step for cooking mode (explicit list or guessing).
// Pure functions without Obsidian, tested in tests/stepIngredients*.test.ts.
import { isEquipment, sameHead } from "./cooking";
import { guessedIngredients, nearest } from "./stepContext";
import { normalize } from "./ingredientWords";
import { cleanItem, unescapeLead } from "./lineEscape";
import type { NoteLang } from "./noteFormat";
import { ingredientName, splitQuantity } from "./quantities";
import { likeness } from "./similar";
import { nameKey, type Hit } from "./stepFilter";
import type { IngredientGroup, Step, StepRef } from "./types";

/** The line under a step: bullet, keyword in either language, colon, items. */
const LINE = /^(\s*)[-*]\s+(?:Zutaten|Ingredients)\s*:\s*(.*)$/i;

/** The words of "no ingredients in this step" ("Zutaten: keine"). */
const NONE = /^(?:keine|none)\.?$/i;

/** The keyword the plugin writes, in the language of the note. */
export const STEP_INGREDIENTS_WORD: Record<NoteLang, string> = { de: "Zutaten", en: "Ingredients" };

/** At most this many items per step, each this long: what an AI's answer and a note may give (SECURITY.md). */
export const STEP_ITEMS = { count: 20, length: 80 };

/**
 * The items of a line under a step; undefined if it is none; an empty list for "no ingredients" (also `Zutaten:`
 * alone). The line is indented, or stands directly under the step (`direct`).
 */
export function readIngredientLine(line: string, direct = false): string[] | undefined {
  const m = LINE.exec(line);
  if (!m || (!m[1] && !direct)) return undefined;
  const value = m[2].trim();
  return NONE.test(value) ? [] : splitItems(value);
}

/**
 * Where the items of a written list are separated: at every comma outside of brackets except between two digits
 * ("1,5 EL Öl"). A comma in brackets ("Salz (Glasur, fein)") is part of the item.
 */
function separators(value: string): number[] {
  const out: number[] = [];
  let depth = 0;
  [...value].forEach((c, i) => {
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0 && !(/\d/.test(value[i - 1] ?? "") && /\d/.test(value[i + 1] ?? ""))) out.push(i);
  });
  return out;
}

/** Items of the written list (see `separators`). */
export function splitItems(value: string): string[] {
  const cuts = separators(value);
  const parts = [...cuts, value.length].map((end, n) => value.slice(n ? cuts[n - 1] + 1 : 0, end));
  return parts.map((s) => unescapeLead(cleanItem(s))).filter(Boolean);
}

/** An item within the limit: the name is cut, the group in brackets at its end never. */
export function capItem(item: string): string {
  const m = /^([^]*?)(\s*\([^()]*\))$/.exec(item);
  return m ? `${m[1].slice(0, STEP_ITEMS.length).trim()}${m[2]}` : item.slice(0, STEP_ITEMS.length);
}

/** The steps of a read recipe as data for a writer (import data, translation): the items of a step as written, within the limits. */
export const stepsAsData = (steps: readonly Step[]) =>
  steps.map((s) => ({
    ...(s.title ? { title: s.title } : {}),
    text: s.text,
    ...(s.ingredients ? { ingredients: s.ingredients.slice(0, STEP_ITEMS.count).map((x) => capItem(x.text)) } : {}),
  }));

/** A new step is the old one if it shares at least this much of the content words, and the next best is this much behind. */
const LIKE = { least: 0.5, margin: 0.25 };

/**
 * The lines of the note for a new version of its steps (a proposal, "Fetch again"). They are carried over only if the
 * new version has none itself and every step of the note with a line has one new step that is clearly the same: the best
 * by shared content words (function words left out), clearly ahead of the second best, each new step used once. Where
 * that is not clear the position of the old step decides only between equally good ones; if it does not, or one step
 * finds none, all old lines go and the recipe is guessed again: never half explicit.
 */
export function withKeptLines<T extends { text: string; ingredients?: string[] }>(
  steps: T[],
  old: readonly Step[],
): T[] {
  if (steps.some((s) => s.ingredients) || !isExplicit(old)) return steps;
  const taken = new Set<number>();
  const target = new Map<number, number>();
  for (const [i, o] of old.entries()) {
    if (!o.ingredients) continue;
    const scored = steps
      .map((s, j) => ({ j, score: taken.has(j) ? 0 : likeness(o.text, s.text) }))
      .filter((c) => c.score >= LIKE.least)
      .sort((a, b) => b.score - a.score);
    const [best, next] = scored;
    const clear = best && (!next || best.score - next.score >= LIKE.margin);
    const tied = best && !clear ? scored.find((c) => c.j === i && best.score - c.score < LIKE.margin) : undefined;
    const pick = clear ? best : tied;
    if (!pick) return steps;
    taken.add(pick.j);
    target.set(pick.j, i);
  }
  return steps.map((s, j) => {
    const from = old[target.get(j) ?? -1];
    return from?.ingredients ? { ...s, ingredients: from.ingredients.map((x) => x.text) } : s;
  });
}

/** The items as the editor shows them: one text, separated by commas. */
export const joinItems = (items: string[]): string => items.join(", ");

/** An item as written in the line: one line, no comma that would split it (see `separators`); the others stay. */
export function writableItem(s: string): string {
  const item = cleanItem(s);
  const cuts = new Set(separators(item));
  return [...item]
    .map((c, i) => (cuts.has(i) ? " " : c))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

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
 * name key of the list, `nameKey`) in the named groups, or in all groups without equipment. Without an exact name the
 * head word decides, but only inside a named group ("Öl" in the group of "Olivenöl extra vergine"); none: the item is shown as written.
 */
export function resolveItem(item: string, groups: IngredientGroup[]): StepRef {
  const written = item.trim();
  const bracket = /\s*\(([^()]*)\)\s*$/.exec(written);
  const only = bracket ? groupsNamed(bracket[1], groups) : [];
  const bare = only.length && bracket ? written.slice(0, bracket.index).trim() : written;
  const q = splitQuantity(bare);
  const name = q.amount !== undefined ? q.rest : bare;
  const key = nameKey(name);
  const lines = groups.flatMap((g, group) =>
    isEquipment(g.title) || (only.length && !only.includes(group))
      ? []
      : g.ingredients.flatMap((z, index) => (ingredientName(z) ? [{ group, index, z }] : [])),
  );
  let found = key ? lines.filter((l) => nameKey(l.z) === key) : [];
  if (!found.length && only.length && name) found = lines.filter((l) => sameHead(name, l.z));
  return {
    text: written,
    bare,
    hits: found.map(({ group, index }) => ({ group, index })),
    ...(q.amount !== undefined ? { own: true as const } : {}),
    ...(only.length === 1 ? { group: only[0] } : {}),
  };
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

/** The groups a reference's hits are in. */
const groupsOf = (x: StepRef) => new Set(x.hits.map((h) => h.group));

/**
 * The ingredients of every step: the explicit list if the recipe has one, else guessed from the words of the steps.
 * An item without a group whose name is in several groups goes to the group the nearest steps use unambiguously.
 */
export function ingredientsOfSteps(r: { steps: readonly Step[]; ingredients: IngredientGroup[] }): StepIngredients[] {
  if (!isExplicit(r.steps)) return guessedIngredients(r.steps, r.ingredients).map((hits) => ({ hits, extra: [] }));
  const refs = r.steps.map((s) => (s.ingredients ?? []).filter((x) => !x.own));
  const active = refs.map((xs) => new Set(xs.filter((x) => groupsOf(x).size === 1).flatMap((x) => [...groupsOf(x)])));
  return r.steps.map((s, i) => {
    const seen = new Set<string>();
    const hits = refs[i]
      .flatMap((x) => {
        const gs = groupsOf(x);
        const chosen = gs.size > 1 ? nearest(active, i, gs) : gs;
        return x.hits.filter((h) => !chosen.size || chosen.has(h.group));
      })
      .filter((h) => !seen.has(`${h.group}-${h.index}`) && !!seen.add(`${h.group}-${h.index}`));
    const extra = (s.ingredients ?? []).filter((x) => x.own || !x.hits.length).map((x) => x.bare);
    return { hits, extra };
  });
}

/**
 * The items the guessing finds for each step, as names for the editor (without amount, with the group in brackets if the
 * name is in several groups). Used when the first list is written into a recipe that had none, so the other steps keep what they showed.
 */
export function guessedItems(
  steps: readonly { title?: string; text: string }[],
  groups: IngredientGroup[],
): string[][] {
  const per = ingredientsOfSteps({
    steps: steps.map(({ title, text }) => ({ ...(title ? { title } : {}), text })),
    ingredients: groups,
  });
  return per.map((p) =>
    p.hits.map((h) => {
      const line = groups[h.group].ingredients[h.index];
      const title = groups[h.group].title;
      const twin = groups.some((g, gi) => gi !== h.group && g.ingredients.some((z) => nameKey(z) === nameKey(line)));
      return twin && title ? `${ingredientName(line)} (${title.replace(/[()]/g, "").trim()})` : ingredientName(line);
    }),
  );
}
