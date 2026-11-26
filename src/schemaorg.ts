// Reads schema.org recipe data (JSON-LD) from the HTML of a recipe website, without AI and without a third-party service.
// Pure functions without Obsidian and without a DOM, tested in tests/schemaorg.test.ts.
// The page is untrusted (SECURITY.md): values are data only, texts are stripped of HTML,
// and everything stays in the fixed structure of SchemaRecipe.

import type { NoteLang } from "./noteFormat";
import { trIn } from "./i18n";
import { cookingSteps, type RawStep } from "./stepSplit";

export interface SchemaRecipe {
  title: string;
  description?: string;
  author?: string;
  category?: string;
  /** Yield as on the page, e.g. "4 Portionen" or "1 Kuchen". */
  result?: string;
  /** Minutes of active work (prepTime). */
  timeActive?: number;
  /** Total minutes (totalTime, otherwise prepTime + cookTime). */
  timeTotal?: number;
  ingredients: string[];
  steps: { title?: string; text: string }[];
  /** Absolute http(s) addresses of the images; the first one is the cover image. */
  images: string[];
  /** Tips, only from pasted text (textRecipe.ts) and translations. */
  tips?: string[];
  /** Parts that were cut because the source had more than the limits allow; the note is then marked partial. */
  truncated?: ("ingredients" | "steps")[];
  /** Ingredients with group titles (translations); when set, recipeNote writes these instead of `ingredients`. */
  ingredientGroups?: { title?: string; ingredients: string[] }[];
}

/** Limits per recipe (SECURITY.md): what a page or an AI can put into a note. */
export const LIMITS = { ingredients: 150, steps: 80, rawSteps: 200, stepText: 4000 };

/** Groups cut to `max` ingredients in total (empty groups dropped); `cut` says that something was left out. */
export function limitGroups(
  groups: { title?: string; ingredients: string[] }[],
  max = LIMITS.ingredients,
): { groups: { title?: string; ingredients: string[] }[]; cut: boolean } {
  let left = max;
  let cut = false;
  const out = groups
    .map((g) => {
      const ingredients = g.ingredients.slice(0, left);
      left -= ingredients.length;
      if (ingredients.length < g.ingredients.length) cut = true;
      return { ...g, ingredients };
    })
    .filter((g) => g.ingredients.length);
  return { groups: out, cut };
}

type Json = unknown;
type Obj = Record<string, Json>;

const isObject = (x: Json): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const asList = (x: Json): Json[] => (Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]);

/** Finds the first Recipe object in the JSON-LD blocks of the page; null if there is none. */
export function findRecipeJsonLd(html: string): Obj | null {
  const block = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = block.exec(html); m; m = block.exec(html)) {
    let data: Json;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue;
    }
    const r = searchRecipes(data, 0);
    if (r) return resolveLinks(r, idIndex(data));
  }
  return null;
}

/** All objects with "@id" in the block (WordPress/Yoast links from the recipe to image and author in @graph). */
function idIndex(x: Json, v = new Map<string, Obj>(), depth = 0): Map<string, Obj> {
  if (depth > 6) return v;
  if (Array.isArray(x)) x.forEach((e) => idIndex(e, v, depth + 1));
  else if (isObject(x)) {
    if (typeof x["@id"] === "string" && Object.keys(x).length > 1 && !v.has(x["@id"])) v.set(x["@id"], x);
    for (const k of Object.keys(x)) if (k !== "@id") idIndex(x[k], v, depth + 1);
  }
  return v;
}

/** Replaces bare references ({"@id": …}) in the recipe's fields with the object, one level deep. */
function resolveLinks(r: Obj, v: Map<string, Obj>): Obj {
  const replace = (x: Json): Json => {
    if (Array.isArray(x)) return x.map(replace);
    if (isObject(x) && typeof x["@id"] === "string" && Object.keys(x).length === 1) return v.get(x["@id"]) ?? x;
    return x;
  };
  const off: Obj = {};
  for (const [k, value] of Object.entries(r)) off[k] = replace(value);
  return off;
}

/** Preview image of the page (og:image) if the recipe does not name one. */
export function findPreviewImage(html: string, page: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(property|name)\s*=\s*["']?(og:image|og:image:url|twitter:image)["'\s>]/i.test(tag)) continue;
    const content = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const raw = content?.[2] ?? content?.[3];
    if (!raw) continue;
    const url = images(entities(raw), page)[0];
    if (url) return url;
  }
  return undefined;
}

function isRecipeType(o: Obj): boolean {
  return asList(o["@type"]).some((t) => typeof t === "string" && /(^|[/:])Recipe$/i.test(t));
}

function searchRecipes(x: Json, depth: number): Obj | null {
  if (depth > 6) return null;
  if (Array.isArray(x)) {
    for (const e of x) {
      const r = searchRecipes(e, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObject(x)) return null;
  if (isRecipeType(x)) return x;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const r = searchRecipes(x[k], depth + 1);
    if (r) return r;
  }
  return null;
}

/**
 * Turns a Recipe object into the fixed structure; `page` is the address of the page (for relative image paths),
 * `lang` the language of the note for words the page does not give (yield without a unit).
 */
export function recipeFromSchema(o: Obj, page: string, lang: NoteLang = "de"): SchemaRecipe {
  const prep = durationMinutes(o.prepTime);
  const cook = durationMinutes(o.cookTime);
  const total = durationMinutes(o.totalTime) ?? (prep !== undefined && cook !== undefined ? prep + cook : undefined);
  const all = asList(o.recipeIngredient ?? o.ingredients)
    .map((z) => singleLine(text(z)))
    .filter(Boolean);
  const raw = rawSteps(o.recipeInstructions);
  const cooked = cookingSteps(raw.steps);
  const truncated: NonNullable<SchemaRecipe["truncated"]> = [];
  if (all.length > LIMITS.ingredients) truncated.push("ingredients");
  if (raw.cut || cooked.cut) truncated.push("steps");
  return {
    title: singleLine(text(o.name)) || "Rezept",
    description: singleLine(text(o.description)) || undefined,
    author: names(o.author),
    category:
      singleLine(
        asList(o.recipeCategory)
          .map((k) => text(k))
          .filter(Boolean)[0] ?? "",
      ) || undefined,
    result: yieldText(o.recipeYield ?? o.yield, lang),
    timeActive: prep,
    timeTotal: total,
    ingredients: all.slice(0, LIMITS.ingredients),
    steps: cooked.steps,
    ...(truncated.length ? { truncated } : {}),
    images: images(o.image, page),
  };
}

/** ISO 8601 duration (PT1H30M, P0DT0H20M, PT90M) in minutes; undefined if unreadable or 0. */
export function durationMinutes(x: Json): number | undefined {
  if (typeof x !== "string") return undefined;
  const m =
    /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(
      x.trim(),
    );
  if (!m) return undefined;
  const z = (s?: string) => (s ? Number(s.replace(",", ".")) : 0);
  const min = Math.round(z(m[1]) * 1440 + z(m[2]) * 60 + z(m[3]) + z(m[4]) / 60);
  return min > 0 ? min : undefined;
}

/** Words for yields without a unit of their own, in the language of the note (issue #24). */
const yieldWords = (lang: NoteLang) => ({ servings: trIn(lang, "servingsUnit"), pieces: trIn(lang, "piecesUnit") });

function yieldText(x: Json, lang: NoteLang): string | undefined {
  const w = yieldWords(lang);
  const values = asList(x)
    .map((v) => (typeof v === "number" ? String(v) : singleLine(text(v))))
    .filter(Boolean);
  // Often the same value appears twice ("4", "4 Portionen"): take the one with a word.
  const withWord = values.find((v) => /\d/.test(v) && /\p{L}/u.test(v));
  let value = withWord ?? values[0];
  if (!value) return undefined;
  // Bring English values into the form the servings calculator reads ("Serves 4" → "4 servings").
  const en = /^(serves|servings?|yields?|makes)[:\s]+(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(value);
  if (en) value = `${en[2]} ${en[3] || (/^makes/i.test(en[1]) ? w.pieces : w.servings)}`.trim();
  return /^\d+(?:[.,]\d+)?$/.test(value) ? `${value} ${w.servings}` : value;
}

function names(x: Json): string | undefined {
  const n = asList(x)
    .map((a) => (isObject(a) ? text(a.name) : text(a)))
    .map(singleLine)
    .filter(Boolean);
  return n.length ? n.join(", ") : undefined;
}

/**
 * Steps of the instructions as written on the page (one entry per HowToStep or text line, with the section name),
 * limited in number and length before anything is split; `cut` says that something was left out.
 */
function rawSteps(x: Json): { steps: RawStep[]; cut: boolean } {
  const off: RawStep[] = [];
  let cut = false;
  const add = (s: RawStep) => {
    if (off.length >= LIMITS.rawSteps) cut = true;
    else if (s.text.length > LIMITS.stepText) {
      cut = true;
      off.push({ ...s, text: s.text.slice(0, LIMITS.stepText) });
    } else off.push(s);
  };
  const take = (s: Json, depth: number, section?: string) => {
    if (depth > 4 || off.length >= LIMITS.rawSteps) return;
    if (typeof s === "string") {
      // One text block: split into lines, remove numbers at the start of lines (the list numbers again).
      for (const line of text(s.slice(0, LIMITS.stepText * 20), true).split(/\n+/)) {
        const z = singleLine(line).replace(/^\d{1,2}[.)]\s+/, "");
        if (z) add({ text: z, section });
      }
      return;
    }
    if (Array.isArray(s)) return s.forEach((e) => take(e, depth + 1, section));
    if (!isObject(s)) return;
    if (asList(s["@type"]).includes("HowToSection") || s.itemListElement !== undefined) {
      const name = singleLine(text(s.name ?? "")).slice(0, 40) || undefined;
      return take(s.itemListElement, depth + 1, name ?? section);
    }
    const t = singleLine(text(s.text ?? s.description ?? ""));
    const n = singleLine(text(s.name ?? ""));
    if (!t && !n) return;
    // Many pages set name = text or name = start of text: then no title of its own.
    const title = n && t && !t.startsWith(n.replace(/[.…]+$/, "")) && n.length <= 60 ? n : undefined;
    add({ title, text: t || n, section });
  };
  take(x, 0);
  return { steps: off, cut };
}

function images(x: Json, page: string): string[] {
  const urls: string[] = [];
  for (const b of asList(x)) {
    const raw = typeof b === "string" ? b : isObject(b) ? (b.url ?? b.contentUrl) : undefined;
    if (typeof raw !== "string") continue;
    try {
      const u = new URL(raw.trim(), page);
      if ((u.protocol === "https:" || u.protocol === "http:") && !urls.includes(u.href)) urls.push(u.href);
    } catch {
      /* keine gültige Adresse */
    }
  }
  return urls;
}

// ---------------------------------------------------------------- Text

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  deg: "°",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  times: "×",
  middot: "·",
  shy: "",
};

function entities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e] ?? whole;
  });
}

const WITHOUT_TAGS = (s: string) => s.replace(/<[^>]*>/g, " ");

/** Text from a JSON value: HTML tags removed, entities decoded (also double-encoded ones). */
function text(x: Json, keepLines = false): string {
  if (typeof x === "number") return String(x);
  if (typeof x !== "string") return "";
  let s = x.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n");
  s = WITHOUT_TAGS(entities(WITHOUT_TAGS(s)));
  if (!keepLines) s = s.replace(/\s+/g, " ");
  return s;
}

/** A value as one plain line of text (HTML removed, entities decoded); for values of an AI's answer. */
export const plainLine = (x: Json): string => singleLine(text(x));

function singleLine(s: string): string {
  return s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Readable text of a whole page for an AI: without scripts, styles and markup, lines kept, at most `max` characters. */
export function pageText(html: string, max = 30_000): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|br|section|article|header|footer|table)\b[^>]*>/gi, "\n");
  return text(body, true).split("\n").map(singleLine).filter(Boolean).join("\n").slice(0, max);
}
