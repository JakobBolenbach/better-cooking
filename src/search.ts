// Search across all recipes: MiniSearch (BM25+, prefix, typos) with German normalization
// and partial-word hits for compound words ("mehl" finds "Dinkelmehl").
// The index lives in memory only and is updated per recipe on changes (fast even with hundreds of recipes).
import MiniSearch from "minisearch";
import type { Recipe } from "./types";

/** Lower case, ß → ss, umlauts and accents to the base letter, ae/oe/ue like ä/ö/ü. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

const WORD = /[\p{L}\p{N}]+/gu;

/** When indexing: every word, plus the endings of long words from 4 characters on (partial words). */
export function splitIndex(text: string): string[] {
  const out: string[] = [];
  for (const w of normalize(text).match(WORD) ?? []) {
    out.push(w);
    if (w.length >= 7) for (let i = 1; i <= w.length - 4; i++) out.push(w.slice(i));
  }
  return out;
}

export function splitSearch(text: string): string[] {
  return normalize(text).match(WORD) ?? [];
}

export type Field = "titel" | "kategorie" | "zutaten" | "autor" | "beschreibung" | "schritte" | "tipps" | "notizen";
export const FIELD_NAMES: Record<Field, string> = {
  titel: "Titel",
  kategorie: "Kategorie",
  zutaten: "Zutaten",
  autor: "Autor",
  beschreibung: "Beschreibung",
  schritte: "Schritte",
  tipps: "Tipps",
  notizen: "Notizen",
};
const FIELDS = Object.keys(FIELD_NAMES) as Field[];
const BOOST: Record<Field, number> = {
  titel: 5,
  kategorie: 3,
  zutaten: 2.5,
  autor: 1.5,
  beschreibung: 1,
  schritte: 0.6,
  tipps: 0.6,
  notizen: 0.6,
};

interface Doc extends Record<Field, string> {
  id: string;
}

const asDocument = (r: Recipe): Doc => ({
  id: r.path,
  titel: r.title,
  kategorie: r.category ?? "",
  zutaten: r.ingredients.flatMap((g) => [g.title ?? "", ...g.ingredients]).join("\n"),
  autor: r.author ?? "",
  beschreibung: r.description ?? "",
  schritte: r.steps.map((s) => `${s.title ?? ""} ${s.text}`).join("\n"),
  tipps: r.tips.join("\n"),
  notizen: [...r.notes, ...r.attempts.flatMap((v) => v.lines)].join("\n"),
});

export interface Hit {
  path: string;
  score: number;
  /** Fields with a match, sorted by weight. */
  fields: Field[];
  /** true if not all search words matched (fallback to OR). */
  approximate: boolean;
}

export class RecipeSearch {
  private ms = new MiniSearch<Doc>({
    fields: FIELDS,
    idField: "id",
    tokenize: splitIndex,
    processTerm: (t) => t,
    searchOptions: {
      tokenize: splitSearch,
      processTerm: (t) => t,
      boost: BOOST,
      prefix: true,
      fuzzy: (t) => (t.length >= 5 ? 0.2 : false),
      weights: { fuzzy: 0.45, prefix: 0.6 },
      combineWith: "AND",
    },
  });
  private state = new Map<string, number>();

  /** Bring the index in line with the current recipes: touch only changed, new and deleted ones. */
  reconcile(recipes: Recipe[]) {
    const da = new Set(recipes.map((r) => r.path));
    for (const path of [...this.state.keys()]) {
      if (!da.has(path)) {
        this.ms.discard(path);
        this.state.delete(path);
      }
    }
    for (const r of recipes) {
      const st = this.state.get(r.path);
      if (st === r.modified) continue;
      if (st !== undefined) this.ms.discard(r.path);
      this.ms.add(asDocument(r));
      this.state.set(r.path, r.modified);
    }
  }

  search(request: string): Hit[] {
    const q = request.trim();
    if (!q) return [];
    let raw = this.ms.search(q);
    let approximate = false;
    if (!raw.length && splitSearch(q).length > 1) {
      raw = this.ms.search(q, { combineWith: "OR" });
      approximate = true;
    }
    return raw.map((r) => {
      const fields = new Set<Field>();
      for (const fs of Object.values(r.match)) for (const f of fs) fields.add(f as Field);
      return {
        path: String(r.id),
        score: r.score,
        fields: FIELDS.filter((f) => fields.has(f)),
        approximate: approximate,
      };
    });
  }

  /** Completion suggestions (e.g. "dink" → "dinkelmehl"). */
  suggestions(request: string, max = 5): string[] {
    if (!request.trim()) return [];
    return this.ms
      .autoSuggest(request, { fuzzy: 0.2 })
      .slice(0, max)
      .map((s) => s.suggestion);
  }
}
