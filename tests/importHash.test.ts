import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ normalizePath: (p: string) => p, requestUrl: vi.fn() }));

import { saveRecipe } from "../src/localImport";
import { editedParts, parseHash } from "../src/fingerprint";
import { parseRecipe } from "../src/parse";
import type { SchemaRecipe } from "../src/schemaorg";

const recipe: SchemaRecipe = {
  title: "Biskuit",
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Eier trennen." }],
  images: [],
};

describe("saveRecipe", () => {
  it("writes the import fingerprint of the note", async () => {
    const created: [string, string][] = [];
    const app = {
      vault: {
        getFolderByPath: () => ({}),
        getAbstractFileByPath: () => null,
        create: async (path: string, text: string) => void created.push([path, text]),
      },
    };
    await saveRecipe(app as never, "Recipes", recipe, { source: "https://example.org/biskuit" });
    const [path, text] = created[0];
    const r = parseRecipe(path, text);
    const stored = parseHash(r.importHash);
    expect(Object.keys(stored).sort()).toEqual(["ingredients", "steps", "title"]);
    expect(editedParts(r, stored)).toEqual([]);
    expect(editedParts(parseRecipe(path, text.replace("4 Eier", "5 Eier")), stored)).toEqual(["ingredients"]);
  });
});
