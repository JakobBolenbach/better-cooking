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

/**
 * A vault on a case-insensitive file system (Windows, macOS): lookups are exact, `create` is not.
 * `race` paths appear only after the first check (another device wrote them in the meantime).
 */
function fakeApp(existing: string[], o: { failNote?: boolean; trashFails?: boolean; race?: string[] } = {}) {
  const files = new Map<string, TFile>();
  const folders = new Set<string>();
  const key = (p: string) => p.normalize("NFC").toLowerCase();
  const add = (p: string) => {
    if ([...files.keys()].some((k) => key(k) === key(p))) throw new Error("File already exists.");
    if (o.failNote && p.endsWith(".md")) throw new Error("Disk full.");
    const f = new (TFile as unknown as new (p: string) => TFile)(p);
    files.set(p, f);
    return f;
  };
  existing.forEach((p) => {
    add(p);
    for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) folders.add(p.slice(0, i));
  });
  const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));
  const folder = (dir: string): { name: string; children: unknown[] } => ({
    name: dir.split("/").pop()!,
    get children() {
      const subs = [...folders].filter((f) => parentOf(f) === dir && f !== dir).map(folder);
      return [...[...files.values()].filter((f) => parentOf(f.path) === dir), ...subs];
    },
  });
  const created: string[] = [];
  const vault = {
    getAbstractFileByPath: (p: string) => files.get(p) ?? null,
    getFolderByPath: (p: string) => (folders.has(p) ? folder(p) : null),
    getRoot: () => folder(""),
    createFolder: async (p: string) => {
      if ([...folders].some((f) => key(f) === key(p))) throw new Error("Folder already exists.");
      folders.add(p);
      created.push(p);
    },
    create: async (p: string) => {
      o.race?.splice(0).forEach(add);
      return add(p);
    },
    createBinary: async (p: string) => add(p),
  };
  const trashed: string[] = [];
  const fileManager = {
    trashFile: async (f: { path: string }) => {
      if (o.trashFails) throw new Error("trash failed");
      trashed.push(f.path);
      files.delete(f.path);
    },
  };
  return { app: { vault, fileManager } as never, files, trashed, created };
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
    const { app, files, trashed } = fakeApp([], { failNote: true });
    await expect(saveRecipe(app, "Recipes", recipe, opts)).rejects.toThrow("Disk full.");
    expect(trashed).toEqual(["Recipes/Bilder/Banana bread Titelbild.jpg"]);
    expect([...files.keys()]).toEqual([]);
  });

  it("pathTaken ignores case and Unicode form, also at the top of the vault", () => {
    const { app } = fakeApp(["K\u00e4se.md", "Recipes/Straße.md"]);
    const v = (app as unknown as { vault: Parameters<typeof pathTaken>[0] }).vault;
    expect(pathTaken(v, "K\u00c4SE.md")).toBe(true);
    expect(pathTaken(v, "Ka\u0308se.md")).toBe(true);
    expect(pathTaken(v, "Recipes/strasse.md")).toBe(false);
    expect(pathTaken(v, "Recipes/STRAßE.md")).toBe(true);
    expect(pathTaken(v, "Recipes/Brot.md")).toBe(false);
  });

  it("writes into a folder that exists in another spelling instead of creating a second one", async () => {
    const { app, files, created } = fakeApp(["Recipes/bilder/Old.jpg"]);
    const saved = await saveRecipe(app, "Recipes", recipe, opts);
    expect(created).toEqual([]);
    expect(saved.path).toBe("Recipes/Banana bread.md");
    expect(files.has("Recipes/bilder/Banana bread Titelbild.jpg")).toBe(true);
  });

  it("keeps a given image when the note cannot be created", async () => {
    const { app, trashed } = fakeApp([], { failNote: true });
    await expect(saveRecipe(app, "Recipes", recipe, { source: "x", image: "Mine.jpg" })).rejects.toThrow("Disk full.");
    expect(trashed).toEqual([]);
  });

  it("lets the original error through when the trash fails too", async () => {
    const { app } = fakeApp([], { failNote: true, trashFails: true });
    await expect(saveRecipe(app, "Recipes", recipe, opts)).rejects.toThrow("Disk full.");
  });

  it("takes the next number when the name was taken between the check and create", async () => {
    const { app, files } = fakeApp([], { race: ["Recipes/BANANA BREAD.md"] });
    const saved = await saveRecipe(app, "Recipes", recipe, { source: "x" });
    expect(saved.path).toBe("Recipes/Banana bread 2.md");
    expect(files.size).toBe(2);
  });
});
