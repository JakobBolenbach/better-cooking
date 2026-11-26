// Structures pasted recipe text without AI (issue #15): title, description, ingredients and steps by simple
// rules. Headings like "Zutaten"/"Ingredients" and "Zubereitung"/"Steps" decide where possible; otherwise lines
// that start with a quantity are ingredients and numbered or longer lines are steps.
// Pure functions without Obsidian, tested in tests/textRecipe.test.ts. The text is untrusted like a web page:
// the result goes through recipeNote, which neutralizes every line.

import type { SchemaRecipe } from "./schemaorg";
import { YIELD_LEAD, readResult, splitQuantity, stripYieldLead } from "./quantities";
import { isYieldUnit } from "./servingsWords";
import { heading, headingYield, type Section } from "./headings";
import { cookingSteps } from "./stepSplit";
import { LIMITS, limitGroups } from "./schemaorg";
import { isEquipment, startsWithTime } from "./cooking";
import { prepareCaption, type CaptionOptions } from "./caption";

const BULLET = /^\s*(?:[-*•·▪◦‣]|\d{1,2}[.)]|\(\d{1,2}\)|[☐☑✓✔]|\p{Extended_Pictographic})\s*/u;

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
  if (raw.length > 40 || /^\s*(?:\d{1,2}[.)]|\(\d{1,2}\))\s/.test(raw)) return undefined;
  const line = clean(raw.replace(BULLET, ""));
  return YIELD_LEAD.test(line) && /\d/.test(line) ? validYield(line) : undefined;
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
  const steps: { title?: string; text: string }[] = [];
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
      title = line.replace(/^#+\s*/, "").slice(0, 120);
      continue;
    }
    const group = section === "ingredients" ? groupTitle(line) : undefined;
    if (group) groups.push({ title: group, ingredients: [] });
    else if (section === "ingredients") addIngredient(line);
    else if (section === "steps") steps.push(step(line));
    else if (section === "tips") tips.push(line);
    else if (looksLikeIngredient(line)) addIngredient(line);
    else if (/^\s*\d{1,2}[.)]\s/.test(raw) || (ingredients.length && (line.length > 40 || /[.!]$/.test(line))))
      steps.push(step(line));
    else before.push(line);
  }
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

/** "Kneten: 10 Min. kneten" → title "Kneten"; titles only when short and followed by a colon. */
function step(line: string): { title?: string; text: string } {
  const m = /^\*{0,2}([^:]{2,40}?)\*{0,2}:\s+(.{3,})$/.exec(line);
  return m ? { title: m[1].trim(), text: m[2].trim() } : { text: line };
}
