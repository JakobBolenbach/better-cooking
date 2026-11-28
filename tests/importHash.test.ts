import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ normalizePath: (p: string) => p, requestUrl: vi.fn() }));

import { saveRecipe } from "../src/localImport";
import { editedParts, storedHashes } from "../src/fingerprint";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { parseRecipe } from "../src/parse";
import type { SchemaRecipe } from "../src/schemaorg";

const recipe: SchemaRecipe = {
  title: "Biskuit",
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Eier trennen." }],
  images: [],
};

describe("saveRecipe", () => {
  it("writes the way of reading, but only when it is given", async () => {
    const created: string[] = [];
    const app = {
      vault: {
        getFolderByPath: () => ({ children: [] }),
        getRoot: () => ({ children: [] }),
        getAbstractFileByPath: () => null,
        create: async (path: string, text: string) => {
          created.push(text);
          return { path };
        },
      },
    };
    await saveRecipe(app as never, "Recipes", recipe, { via: "page" });
    await saveRecipe(app as never, "Recipes", { ...recipe, title: "Zwei" }, {});
    expect(created[0]).toContain("import_weg: page\n");
    expect(created[1]).not.toContain("import_weg");
  });

  it("writes the import fingerprint of the note", async () => {
    const created: [string, string][] = [];
    const app = {
      vault: {
        getFolderByPath: () => ({ children: [] }),
        getRoot: () => ({ children: [] }),
        getAbstractFileByPath: () => null,
        create: async (path: string, text: string) => {
          created.push([path, text]);
          return { path };
        },
      },
    };
    await saveRecipe(app as never, "Recipes", recipe, { source: "https://example.org/biskuit" });
    const [path, text] = created[0];
    const r = parseRecipe(path, text);
    const stored = storedHashes(r);
    expect(Object.keys(stored).sort()).toEqual(
      ["description", "ingredients", "steps", "tips", "times", "title", "yield"].sort(),
    );
    expect(editedParts(text, DEFAULT_FORMAT.fields, stored)).toEqual([]);
    expect(editedParts(text.replace("4 Eier", "5 Eier"), DEFAULT_FORMAT.fields, stored)).toEqual(["ingredients"]);
  });
});
