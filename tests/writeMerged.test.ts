import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ normalizePath: (p: string) => p, requestUrl: vi.fn(), TFile: class {} }));

import { writeMerged } from "../src/refetchService";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";

const first: SchemaRecipe = {
  title: "Biskuit",
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Eier trennen." }],
  images: [],
};
const page: SchemaRecipe = {
  ...first,
  ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"],
  steps: [{ text: "Backen." }],
};
const o = { format: DEFAULT_FORMAT, today: "2026-11-27", replace: [] };

/** A vault with one note; `during` runs between the backup and the write. */
function setup(text: string, during?: () => void) {
  const files = new Map<string, string>([["Recipes/Biskuit.md", text]]);
  const trashed: string[] = [];
  const file = { path: "Recipes/Biskuit.md", basename: "Biskuit" };
  const plugin = {
    settings: { folder: "Recipes" },
    noteFormat: () => DEFAULT_FORMAT,
    app: {
      fileManager: { trashFile: async (f: { path: string }) => void trashed.push(f.path) },
      vault: {
        read: async () => files.get(file.path)!,
        getFolderByPath: () => ({ children: [...files.keys()].map((p) => ({ name: p.split("/").pop() })) }),
        getAbstractFileByPath: (p: string) => (files.has(p) ? {} : null),
        create: async (p: string, t: string) => {
          files.set(p, t);
          during?.();
          return { path: p, name: p.split("/").pop() };
        },
        process: async (_f: unknown, fn: (t: string) => string) => files.set(file.path, fn(files.get(file.path)!)),
      },
    },
  };
  return { plugin: plugin as never, file: file as never, files, trashed, set: (t: string) => files.set(file.path, t) };
}

const stored = recipeNote(first, { source: "https://example.org/a", today: "2026-11-01" });
const edited = stored.replace("- 100 g Zucker", "- 80 g Zucker");

describe("writeMerged", () => {
  it("keeps a hand edit, replaces the rest and backs up the old version", async () => {
    const s = setup(edited);
    const res = await writeMerged(s.plugin, s.file, page, { ...o });
    expect(res.kind).toBe("written");
    const r = parseRecipe("x", s.files.get("Recipes/Biskuit.md")!);
    expect(r.ingredients[0].ingredients).toEqual(["4 Eier", "80 g Zucker"]);
    expect(r.steps).toEqual([{ text: "Backen." }]);
    expect([...s.files.keys()].some((k) => k.startsWith("Recipes/Vorversionen/"))).toBe(true);
  });

  it("replaces the edit when asked", async () => {
    const s = setup(edited);
    await writeMerged(s.plugin, s.file, page, { ...o, replace: ["ingredients"] });
    expect(parseRecipe("x", s.files.get("Recipes/Biskuit.md")!).ingredients[0].ingredients).toHaveLength(3);
  });

  it("writes nothing and makes no backup when nothing would change", async () => {
    const s = setup(stored);
    expect((await writeMerged(s.plugin, s.file, first, { ...o })).kind).toBe("unchanged");
    expect(s.files.size).toBe(1);
  });

  it("says allKept, writing nothing, when only your own edits differ", async () => {
    const s = setup(edited);
    const same = { ...first, ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"] };
    expect((await writeMerged(s.plugin, s.file, same, { ...o })).kind).toBe("allKept");
    expect(s.files.size).toBe(1);
    expect((await writeMerged(s.plugin, s.file, same, { ...o, replace: ["ingredients"] })).kind).toBe("written");
  });

  it("takes the backup away again when the note changed in between", async () => {
    const s = setup(edited, () => s.set(edited + "\nNeu."));
    expect((await writeMerged(s.plugin, s.file, page, { ...o })).kind).toBe("conflict");
    expect(s.trashed).toHaveLength(1);
    expect(s.files.get("Recipes/Biskuit.md")).toBe(edited + "\nNeu.");
  });
});
