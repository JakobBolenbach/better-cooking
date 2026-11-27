// Structures pasted recipe text without AI (issue #15): title, description, ingredients and steps by simple
// rules. Headings like "Zutaten"/"Ingredients" and "Zubereitung"/"Steps" decide where possible; otherwise lines
// that start with a quantity are ingredients and numbered or longer lines are steps.
// Pure functions without Obsidian, tested in tests/textRecipe.test.ts. The text is untrusted like a web page:
// the result goes through recipeNote, which neutralizes every line.

import type { SchemaRecipe } from "./schemaorg";
import { YIELD_LEAD, readResult, splitQuantity, stripYieldLead } from "./quantities";
import { isYieldUnit } from "./servingsWords";
import { EMOJI, NUMBERED, heading, headingYield, isNumbered, titleYield, type Section } from "./headings";
import { cookingSteps, type RawStep } from "./stepSplit";
import { splitEnumeration } from "./sentences";
import { LIMITS, limitGroups } from "./schemaorg";
import { isEquipment, startsWithTime } from "./cooking";
import { prepareCaption, type CaptionOptions } from "./caption";

const BULLET = new RegExp(String.raw`^\s*(?:[-*•·▪◦‣]|${NUMBERED}|[☐☑✓✔]|\p{Extended_Pictographic})\s*`, "u");

const clean = (s: string) =>
  s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A yield text for scaling: "4 Personen", "12 Brötchen", "4"; undefined for a time ("20 Min. ruhen") or a measure ("200 g"). */
function validYield(text: string): string | undefined {
  const t = stripYieldLead(text);
  const read = readResult(t);
  if (!read || startsWithTime(t)) return undefined;
  const unit = splitQuantity(t).unit;
  return unit && !isYieldUnit(unit) ? undefined : t;
}

/**
 * A yield line: "Ergibt: 8 Stück", "Für 2 Personen", "Serves 4", "Portionen: 4" → "8 Stück", "2 Personen", "4". Never a
 * numbered step ("1. Für 20 Min. ruhen lassen.").
 */
function yieldOf(raw: string): string | undefined {
  if (raw.length > 40 || isNumbered(raw)) return undefined;
  const line = clean(raw.replace(BULLET, ""));
  return YIELD_LEAD.test(line) && /\d/.test(line) ? validYield(line) : undefined;
}

// Emoji go from the title, "©", "®" and "™" with them (they are pictographs too); flags stay (regional indicators are none).
const EMOJI_ALL = new RegExp(EMOJI, "gu");
const SEPARATORS = /^[\s,;:|–—-]+|[\s,;:|–—-]+$/g;

/**
 * The title line without emoji and a yield at its end ("Tomatensuppe 🍅 für 2 Personen" → "Tomatensuppe", "2 Personen").
 * What counts as a yield and when the title may lose it is decided by `titleYield` (headings.ts).
 */
function titleOf(line: string): { title: string; result?: string } {
  const plain = line.replace(EMOJI_ALL, " ").replace(/\s+/g, " ").replace(SEPARATORS, "");
  const y = titleYield(plain);
  const result = y && validYield(y.tail);
  if (!y || !result) return { title: plain || line };
  return { title: y.shorten ? y.head : plain, result };
}

const looksLikeIngredient = (line: string) =>
  splitQuantity(line).amount !== undefined && line.length <= 90 && !/[.!?]$/.test(line.trim());

/** "Für den Teig:" / "Ausstattung" inside the ingredients: the title of a group, otherwise undefined. */
function groupTitle(line: string): string | undefined {
  const t = line.replace(/[:：]\s*$/, "").trim();
  if (t.length < 2 || t.length > 40 || splitQuantity(t).amount !== undefined || /[.!?]$/.test(t)) return undefined;
  const colon = t.length < line.length;
  return colon || /^(für|for)\s+(den|die|das|the|die)\s+\S+/i.test(t) || isEquipment(t) ? t : undefined;
}

/**
 * The recipe in pasted text; undefined if it contains neither ingredients nor steps. Pasted text is changed only by the
 * safe rules of cleanCaption (emoji markers, hashtag lines, Instagram prefix); `caption: true` (the social media import,
 * #87) or a text that is clearly a caption also splits inline headings and one-line captions.
 */
export function recipeFromText(text: string, options: CaptionOptions = {}): SchemaRecipe | undefined {
  const prepared = prepareCaption(text, options);
  const lines = prepared.text.split("\n").map((l) => l.trim());
  const groups: { title?: string; ingredients: string[] }[] = [];
  const ingredients: string[] = [];
  const addIngredient = (z: string) => {
    if (!groups.length) groups.push({ ingredients: [] });
    groups[groups.length - 1].ingredients.push(z);
    ingredients.push(z);
  };
  const steps: RawStep[] = [];
  const tips: string[] = [];
  const before: string[] = [];
  let title = "";
  let result: string | undefined;
  let section: Section | undefined;
  for (const raw of lines) {
    if (!raw) continue;
    const h = heading(raw);
    if (h) {
      const hy = headingYield(raw);
      if (hy && !result) result = validYield(hy);
      section = h;
      continue;
    }
    const y = section ? undefined : yieldOf(raw);
    if (y) {
      result = y;
      continue;
    }
    const line = clean(raw.replace(BULLET, ""));
    if (!line) continue;
    // "Tipp: …" on one line
    const tip = /^(tipps?|tip|hinweis|note)\s*:\s+(.{3,})$/i.exec(line);
    if (tip && (ingredients.length || steps.length)) {
      tips.push(tip[2]);
      continue;
    }
    if (!title && !section && !(prepared.caption && looksLikeIngredient(line))) {
      const t = titleOf(line.replace(/^#+\s*/, ""));
      title = t.title.slice(0, 120);
      if (t.result && !result) result = t.result;
      continue;
    }
    const group = section === "ingredients" ? groupTitle(line) : undefined;
    if (group) groups.push({ title: group, ingredients: [] });
    else if (section === "ingredients") addIngredient(line);
    else if (section === "steps") steps.push(...stepsOf(raw, line));
    else if (section === "tips") tips.push(line);
    else if (looksLikeIngredient(line)) addIngredient(line);
    else if (isNumbered(raw) || (ingredients.length && (line.length > 40 || /[.!]$/.test(line))))
      steps.push(...stepsOf(raw, line));
    else before.push(line);
  }
  return assemble({ title, result, groups, ingredients, steps, tips, before });
}

interface Read {
  title: string;
  result?: string;
  groups: { title?: string; ingredients: string[] }[];
  ingredients: string[];
  steps: RawStep[];
  tips: string[];
  before: string[];
}

/** The recipe from what the lines gave; undefined if there are neither ingredients nor steps. */
function assemble({ title, result, groups, ingredients, steps, tips, before }: Read): SchemaRecipe | undefined {
  if (!ingredients.length && !steps.length) return undefined;
  const grouped = limitGroups(groups);
  const longStep = steps.some((s) => s.text.length > LIMITS.stepText);
  const cooked = cookingSteps(
    steps.slice(0, LIMITS.rawSteps).map((s) => ({ ...s, text: s.text.slice(0, LIMITS.stepText) })),
  );
  const truncated: NonNullable<SchemaRecipe["truncated"]> = [];
  if (grouped.cut || ingredients.length > LIMITS.ingredients) truncated.push("ingredients");
  if (cooked.cut || longStep || steps.length > LIMITS.rawSteps) truncated.push("steps");
  return {
    title: title || "Rezept",
    description: before.length ? before.join(" ").slice(0, 600) : undefined,
    result,
    ingredients: grouped.groups.flatMap((g) => g.ingredients),
    ingredientGroups: groups.some((g) => g.title) ? grouped.groups : undefined,
    steps: cooked.steps,
    tips: tips.length ? tips.slice(0, 30) : undefined,
    ...(truncated.length ? { truncated } : {}),
    images: [],
  };
}

/**
 * A line the author numbered is one step ("1.", "2)", "(3)", keycap emoji) and stays whole; "1. Mix. 2. Bake." in one line
 * is split like an enumeration (`splitEnumeration`: the number follows a sentence end, a capital letter after it; "auf die 2.
 * Schiene" is no number). Other lines are split by the cooking rules.
 */
function stepsOf(raw: string, line: string): RawStep[] {
  if (!isNumbered(raw)) return [step(line)];
  const parts = splitEnumeration(clean(raw), Number(/\d+/.exec(raw)![0])) ?? [line];
  return parts.map((p) => step(p, true));
}

/** "Kneten: 10 Min. kneten" → title "Kneten"; titles only when short and followed by a colon. */
function step(line: string, whole = false): RawStep {
  const m = /^\*{0,2}([^:]{2,40}?)\*{0,2}:\s+(.{3,})$/.exec(line);
  return m ? { title: m[1].trim(), text: m[2].trim() } : { text: line, ...(whole ? { whole } : {}) };
}
