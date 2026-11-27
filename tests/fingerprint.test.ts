import { describe, expect, it } from "vitest";
import { editedParts, fingerprints, fnv1a, formatHash, parseHash, partValues, storedHashes } from "../src/fingerprint";
import { recipeSig } from "../src/listRecipes";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
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
const F = DEFAULT_FORMAT.fields;
const note = (lang: "de" | "en" = "de") =>
  recipeNote(recipe, { today: "2026-11-27", format: makeNoteFormat(lang).format });
const fp = (t: string) => fingerprints(t, F);

describe("hash functions", () => {
  it("recipeSig gives the values stored in data.json before", () => {
    const sig = (...g: string[][]) => recipeSig(g.map((ingredients) => ({ ingredients })));
    expect(sig([])).toBe("ztntfp");
    expect(sig(["4 Eier", "100 g Zucker"])).toBe("1w8wv9c");
    expect(sig(["4 Eier", "100 g Zucker"], ["200 g Mehl"])).toBe("7wjfuv");
  });

  it("fnv1a is the standard FNV-1a over UTF-8 bytes", () => {
    expect(fnv1a("a")).toBe((0xe40c292c).toString(36));
    expect(fnv1a("foobar")).toBe((0xbf9cf968).toString(36));
    expect(fnv1a("")).toBe((0x811c9dc5).toString(36));
    expect(fnv1a("Öl 🍅")).not.toBe(fnv1a("Öl 🍆"));
  });
});

describe("fingerprints", () => {
  it("cover every part the note has", () => {
    expect(Object.keys(fp(note())).sort()).toEqual(
      ["description", "ingredients", "steps", "tips", "times", "title", "yield"].sort(),
    );
    expect(Object.keys(partValues(recipeNote({ ...recipe, tips: [] }, { today: "2026-11-27" }), F))).not.toContain(
      "tips",
    );
  });

  it("stay the same for line endings, spacing, bullets, numbers, checkboxes and the language of the headings", () => {
    const base = fp(note());
    expect(fp(note().replace(/\n/g, "\r\n"))).toEqual(base);
    expect(fp(note().replace("- 4 Eier", "-   4   Eier  "))).toEqual(base);
    expect(fp(note().replace("- 4 Eier", "* 4 Eier"))).toEqual(base);
    expect(fp(note().replace("- 4 Eier", "- [ ] 4 Eier").replace("- 100 g", "- [x] 100 g"))).toEqual(base);
    expect(fp(note().replace("1. **Trennen", "1) **Trennen"))).toEqual(base);
    expect(fp(note("en"))).toEqual(base);
  });

  it("an empty placeholder step or ingredient makes no difference", () => {
    const base = fp(note());
    expect(fp(note().replace("## Versuche", "3. \n\n## Versuche").replace("3. \n\n##", "3.\n\n##"))).toEqual(base);
    const bare = recipeNote({ ...recipe, tips: [] }, { today: "2026-11-27" });
    expect(fp(bare.replace("## Notizen\n- ", "## Notizen\n- x"))).toEqual(fp(bare));
  });

  it("everything else in a section counts", () => {
    const base = fp(note());
    for (const t of [
      note().replace("- 100 g Zucker", "- 100 g Zucker\n> Hinweis"),
      note().replace("- 100 g Zucker", "- 100 g Zucker\n![[Zucker.jpg]]"),
      note().replace("- 100 g Zucker", "- 100 g Zucker\n### Guss"),
      note().replace("- 100 g Zucker", "- 100 g Zucker\n  etwas feiner"),
      note().replace("- 100 g Zucker", "- 100 g Zucker\nFreitext"),
      note().replace("- 100 g Zucker", "- 100 g Zucker\n<!-- x -->"),
      note().replace("- 100 g Zucker", "- 100 g Zucker\n| a | b |"),
    ])
      expect(fp(t).ingredients).not.toBe(base.ingredients);
  });

  it("an edited ingredient marks only the ingredients", () => {
    const stored = fp(note());
    expect(editedParts(note(), F, stored)).toEqual([]);
    expect(editedParts(note().replace("100 g Zucker", "80 g Zucker"), F, stored)).toEqual(["ingredients"]);
  });

  it("a deleted title or an emptied part counts as edited", () => {
    const stored = fp(note());
    expect(editedParts(note().replace("# Biskuit\n", ""), F, stored)).toEqual(["title"]);
    expect(editedParts(note().replace(/## Tipps\n- Ofen vorheizen.\n/, ""), F, stored)).toEqual(["tips"]);
  });

  it("only stored parts can be edited", () => {
    expect(editedParts(note(), F, { title: "zzz" })).toEqual(["title"]);
    expect(editedParts(note(), F, {})).toEqual([]);
  });
});

describe("the field value", () => {
  it("is one quoted string without spaces and reads back", () => {
    const h = fp(note());
    const v = formatHash(h);
    expect(v).toMatch(/^"v1;title:\w+;description:\w+;yield:\w+;times:\w+;ingredients:\w+;steps:\w+;tips:\w+"$/);
    expect(v).not.toContain(" ");
    expect(parseHash(v)).toEqual(h);
    expect(parseHash(v.slice(1, -1))).toEqual(h);
  });

  it("an unknown version, a folded or broken value is no fingerprint", () => {
    for (const v of [
      undefined,
      null,
      5,
      ["a"],
      "",
      "   ",
      "garbage",
      "v1",
      "v1;",
      "v2;title:abc",
      "title:abc",
      ">-",
      "v1;title:",
      "v1;title:A B!",
      "v1;nothing:abc",
      "v1;title:abc;title:def",
      "v1;title:abc;steps",
      "v1;title:abc;;",
      "v1 title:abc",
    ])
      expect(parseHash(v)).toEqual({});
  });

  it("cannot pollute the prototype", () => {
    expect(parseHash('"v1;__proto__:abc"')).toEqual({});
    expect(parseHash('"v1;constructor:abc;title:abc"')).toEqual({});
    const h = parseHash('"v1;title:abc"');
    expect(Object.getPrototypeOf(h)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).abc).toBeUndefined();
  });

  it("a value folded by a YAML writer counts as none", () => {
    const text = note().replace(/^import_hash:.*$/m, "import_hash: >-\n  " + formatHash(fp(note())));
    expect(storedHashes(parseRecipe("x", text))).toEqual({});
  });
});

describe("the note an import writes", () => {
  it("carries the fingerprint of the note as written, in the format's language", () => {
    const text = note();
    expect(storedHashes(parseRecipe("x", text))).toEqual(fp(text));
    expect(note("en")).toMatch(/^import_hash: "v1;title:/m);
    expect(note("de")).toMatch(/^import_hash: "v1;title:/m);
  });

  it("uses an own field name", () => {
    const format = makeNoteFormat("de", "importHash: fingerabdruck").format;
    const text = recipeNote(recipe, { today: "2026-11-27", format });
    expect(text).toMatch(/^fingerabdruck: "v1;title:/m);
    expect(text).not.toContain("import_hash");
    expect(storedHashes(parseRecipe("x", text, 0, format.fields))).toEqual(fingerprints(text, format.fields));
  });
});
