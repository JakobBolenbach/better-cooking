// Structures pasted recipe text without AI (issue #15): title, description, ingredients and steps by simple
// rules. Headings like "Zutaten"/"Ingredients" and "Zubereitung"/"Steps" decide where possible; otherwise lines
// that start with a quantity are ingredients and numbered or longer lines are steps.
// Pure functions without Obsidian, tested in tests/textRecipe.test.ts. The text is untrusted like a web page:
// the result goes through recipeNote, which neutralizes every line.

import type { SchemaRecipe } from "./schemaorg";
import { splitQuantity } from "./quantities";
import { cookingSteps } from "./stepSplit";
import { isEquipment } from "./cooking";

// Whole-line headings; "Zutaten für 4 Personen" counts too.
const INGREDIENTS = /^(zutaten|ingredients?|you('| wi)ll need|was du brauchst)(\s+(für|for)\b.*)?$/i;
const STEPS = /^(zubereitung|schritte|anleitung|so geht'?s|steps|instructions|directions|method|preparation)$/i;
const TIPS = /^(tipps?|hinweise?|notes?|tips?)$/i;
const YIELD = /^(ergibt|für|portionen|servings?|serves|yield|makes)\b[:\s]*(.+)$/i;
const BULLET = /^\s*(?:[-*•·▪◦‣]|\d{1,2}[.)]|\(\d{1,2}\)|[☐☑✓✔]|\p{Extended_Pictographic})\s*/u;

const clean = (s: string) =>
  s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A heading line: short, ends with a colon or is all one of the known words. */
function heading(line: string): "ingredients" | "steps" | "tips" | undefined {
  const t = line
    .replace(/^#+\s*/, "")
    .replace(/[:：]\s*$/, "")
    .trim();
  if (t.length > 40) return undefined;
  if (INGREDIENTS.test(t)) return "ingredients";
  if (STEPS.test(t)) return "steps";
  if (TIPS.test(t)) return "tips";
  return undefined;
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

/** The recipe in pasted text; undefined if it contains neither ingredients nor steps. */
export function recipeFromText(text: string): SchemaRecipe | undefined {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim());
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
  let section: "ingredients" | "steps" | "tips" | undefined;
  for (const raw of lines) {
    if (!raw) continue;
    const h = heading(raw);
    if (h) {
      section = h;
      continue;
    }
    const y = YIELD.exec(raw);
    if (y && !section && raw.length <= 40 && /\d/.test(y[2])) {
      result = clean(raw.replace(/^(ergibt|yield|makes)[:\s]*/i, ""));
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
    if (!title && !section) {
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
  return {
    title: title || "Rezept",
    description: before.length ? before.join(" ").slice(0, 600) : undefined,
    result,
    ingredients: ingredients.slice(0, 150),
    ingredientGroups: groups.some((g) => g.title) ? groups.filter((g) => g.ingredients.length) : undefined,
    steps: cookingSteps(steps).slice(0, 80),
    tips: tips.length ? tips.slice(0, 30) : undefined,
    images: [],
  };
}

/** "Kneten: 10 Min. kneten" → title "Kneten"; titles only when short and followed by a colon. */
function step(line: string): { title?: string; text: string } {
  const m = /^\*{0,2}([^:]{2,40}?)\*{0,2}:\s+(.{3,})$/.exec(line);
  return m ? { title: m[1].trim(), text: m[2].trim() } : { text: line };
}
