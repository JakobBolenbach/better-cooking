import { describe, expect, it } from "vitest";
import { editedParts, fingerprints, fnv1a, formatHash, parseHash, partValues } from "../src/fingerprint";
import { recipeSig } from "../src/listRecipes";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { makeNoteFormat } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";

const recipe: SchemaRecipe = {
  title: "Biskuit",
  description: "Luftig.",
  result: "1 Form",
  timeActive: 20,
  timeTotal: 55,
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [
    { title: "Trennen", text: "Eier trennen." },
    { title: "Backen (30 Min.)", text: "30 Min. backen." },
  ],
  tips: ["Ofen vorheizen."],
  images: [],
};
const note = (lang: "de" | "en" = "de") =>
  recipeNote(recipe, { today: "2026-11-27", format: makeNoteFormat(lang).format });
const read = (text: string) => parseRecipe("Recipes/Biskuit.md", text);

describe("fnv1a and recipeSig", () => {
  it("recipeSig gives the values stored in data.json before", () => {
    const sig = (...g: string[][]) => recipeSig(g.map((ingredients) => ({ ingredients })));
    expect(sig([])).toBe("ztntfp");
    expect(sig(["4 Eier", "100 g Zucker"])).toBe("1w8wv9c");
    expect(sig(["4 Eier", "100 g Zucker"], ["200 g Mehl"])).toBe("7wjfuv");
    expect(fnv1a("Ölivenöl 🍅 mild")).toBe("1t03f8p");
  });
});

describe("fingerprints", () => {
  it("cover every part the note has", () => {
    expect(Object.keys(fingerprints(read(note()))).sort()).toEqual(
      ["description", "ingredients", "steps", "tips", "times", "title", "yield"].sort(),
    );
    expect(Object.keys(partValues(read(recipeNote({ ...recipe, tips: [] }, { today: "2026-11-27" }))))).not.toContain(
      "tips",
    );
  });

  it("stay the same for line endings, spacing and the language of the headings", () => {
    const base = fingerprints(read(note()));
    expect(fingerprints(read(note().replace(/\n/g, "\r\n")))).toEqual(base);
    expect(fingerprints(read(note().replace("- 4 Eier", "-   4   Eier  ")))).toEqual(base);
    expect(fingerprints(read(note("en")))).toEqual(base);
  });

  it("an edited ingredient marks only the ingredients", () => {
    const stored = fingerprints(read(note()));
    expect(editedParts(read(note()), stored)).toEqual([]);
    const edited = note().replace("100 g Zucker", "80 g Zucker");
    expect(editedParts(read(edited), stored)).toEqual(["ingredients"]);
  });

  it("an emptied part counts as edited", () => {
    const stored = fingerprints(read(note()));
    const gone = note().replace(/## Tipps\n- Ofen vorheizen.\n/, "");
    expect(editedParts(read(gone), stored)).toEqual(["tips"]);
  });

  it("only stored parts can be edited", () => {
    expect(editedParts(read(note()), { title: "zzz" })).toEqual(["title"]);
    expect(editedParts(read(note()), {})).toEqual([]);
  });
});

describe("the field value", () => {
  it("is one quoted string and reads back", () => {
    const fp = fingerprints(read(note()));
    const v = formatHash(fp);
    expect(v).toMatch(/^"title=\w+ description=\w+ yield=\w+ times=\w+ ingredients=\w+ steps=\w+ tips=\w+"$/);
    expect(parseHash(v)).toEqual(fp);
    expect(parseHash(v.slice(1, -1))).toEqual(fp);
  });

  it("broken or foreign values give nothing", () => {
    for (const v of [
      undefined,
      null,
      5,
      ["a"],
      "",
      "   ",
      "garbage",
      "title",
      "title=",
      "=abc",
      "nothing=abc",
      "title=A B!",
    ])
      expect(parseHash(v)).toEqual({});
    expect(parseHash("title=abc steps=")).toEqual({ title: "abc" });
  });

  it("cannot pollute the prototype", () => {
    const h = parseHash('"__proto__=abc constructor=abc title=abc title=def"');
    expect(h).toEqual({ title: "abc" });
    expect(Object.getPrototypeOf(h)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).abc).toBeUndefined();
  });
});

describe("the note an import writes", () => {
  it("carries the fingerprint of the note as written, in the format's language", () => {
    const text = note();
    expect(read(text).importHash).toBeDefined();
    expect(parseHash(read(text).importHash)).toEqual(fingerprints(read(text)));
    expect(note("en")).toMatch(/^import_hash: "title=/m);
    expect(note("de")).toMatch(/^import_hash: "title=/m);
  });

  it("uses an own field name", () => {
    const format = makeNoteFormat("de", "importHash: fingerabdruck").format;
    const text = recipeNote(recipe, { today: "2026-11-27", format });
    expect(text).toMatch(/^fingerabdruck: "title=/m);
    expect(text).not.toContain("import_hash");
    expect(parseRecipe("x", text, 0, format.fields).importHash).toContain("title=");
  });
});
