import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class TFile {
    name: string;
    constructor(public path: string) {
      this.name = path.split("/").pop()!;
    }
  }
  return {
    TFile,
    normalizePath: (p: string) => p,
    requestUrl: async () => ({
      status: 200,
      headers: { "content-type": "image/jpeg" },
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    }),
  };
});

import { TFile } from "obsidian";
import { saveRecipe } from "../src/localImport";
import { pathTaken } from "../src/vaultNames";
import type { SchemaRecipe } from "../src/schemaorg";

const recipe: SchemaRecipe = {
  title: "Banana bread",
  ingredients: ["3 bananas"],
  steps: [{ text: "Bake." }],
  images: [],
};

/** A vault on a case-insensitive file system (Windows, macOS): lookups are exact, `create` is not. */
function fakeApp(existing: string[], failNote = false) {
  const files = new Map<string, TFile>();
  const folders = new Set<string>();
  const key = (p: string) => p.normalize("NFC").toLowerCase();
  const add = (p: string) => {
    if ([...files.keys()].some((k) => key(k) === key(p))) throw new Error("File already exists.");
    if (failNote && p.endsWith(".md")) throw new Error("File already exists.");
    const f = new (TFile as unknown as new (p: string) => TFile)(p);
    files.set(p, f);
    return f;
  };
  existing.forEach(add);
  const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));
  const children = (dir: string) => [...files.values()].filter((f) => parentOf(f.path) === dir);
  const vault = {
    getAbstractFileByPath: (p: string) => files.get(p) ?? null,
    getFolderByPath: (p: string) => (folders.has(p) || p === "Recipes/Bilder" ? { children: children(p) } : null),
    getRoot: () => ({ children: children("") }),
    createFolder: async (p: string) => void folders.add(p),
    create: async (p: string) => add(p),
    createBinary: async (p: string) => add(p),
  };
  const trashed: string[] = [];
  const fileManager = {
    trashFile: async (f: { path: string }) => {
      trashed.push(f.path);
      files.delete(f.path);
    },
  };
  folders.add("Recipes");
  return { app: { vault, fileManager } as never, files, trashed };
}

const opts = { source: "https://example.org/r", coverUrl: "https://example.org/x.jpg" };

describe("free file names on case-insensitive file systems", () => {
  it("numbers the note and its image instead of colliding with a name that differs in case", async () => {
    const { app, files } = fakeApp(["Recipes/Banana Bread.md", "Recipes/Bilder/Banana Bread Titelbild.jpg"]);
    const saved = await saveRecipe(app, "Recipes", recipe, opts);
    expect(saved.path).toBe("Recipes/Banana bread 2.md");
    expect(files.has("Recipes/Bilder/Banana bread 2 Titelbild.jpg")).toBe(true);
  });

  it("removes the new image again when the note cannot be created", async () => {
    const { app, files, trashed } = fakeApp([], true);
    await expect(saveRecipe(app, "Recipes", recipe, opts)).rejects.toThrow("File already exists.");
    expect(trashed).toEqual(["Recipes/Bilder/Banana bread Titelbild.jpg"]);
    expect([...files.keys()]).toEqual([]);
  });

  it("pathTaken ignores case and Unicode form, also at the top of the vault", () => {
    const { app } = fakeApp(["Käse.md", "Recipes/Straße.md"]);
    const v = (app as unknown as { vault: Parameters<typeof pathTaken>[0] }).vault;
    expect(pathTaken(v, "KÄSE.md")).toBe(true);
    expect(pathTaken(v, "Käse.md")).toBe(true);
    expect(pathTaken(v, "Recipes/strasse.md")).toBe(false);
    expect(pathTaken(v, "Recipes/STRAßE.md")).toBe(true);
    expect(pathTaken(v, "Recipes/Brot.md")).toBe(false);
  });
});
