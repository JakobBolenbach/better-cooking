// Fake vault and texts for the tests of src/improveService.ts. The test file mocks "obsidian" and "../src/notice"
// (see tests/stubs/obsidianFake.ts); this module is imported after the mocks.
import { vi } from "vitest";
import { TFile } from "obsidian";
import { ImproveService } from "../src/improveService";
import { recipeNote } from "../src/recipeNote";
import { readFrontmatter } from "../src/parse";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";
import type { Job } from "../src/types";

export const FOLDER = "Rezepte";
export const NOTE = `${FOLDER}/Linsensuppe.md`;
export const PROPOSAL = `${FOLDER}/Verbesserungen/rz-m1-0001.md`;
export const COVER = `${FOLDER}/Bilder/rz-m1-0001 Titelbild.webp`;
export const TIMELINE = `${FOLDER}/Bilder/rz-m1-0001 Ablauf.svg`;

export const first: SchemaRecipe = {
  title: "Linsensuppe",
  description: "Aus dem Reel.",
  ingredients: ["250 g Linsen", "1 Zwiebel"],
  steps: [{ text: "Alles kochen." }],
  images: [],
};
export const better: SchemaRecipe = {
  title: "Rote Linsensuppe",
  description: "Aus dem Reel, mit Mengen.",
  result: "4 Portionen",
  ingredients: ["250 g rote Linsen", "1 Zwiebel", "1 l Brühe"],
  steps: [
    { title: "Anschwitzen (5 Min.)", text: "Zwiebel glasig dünsten." },
    { title: "Kochen (15 Min.)", text: "Linsen und Brühe zugeben." },
  ],
  images: [],
};

/** The first version the plugin writes at once: `offen`, with the job ID. */
export const firstVersion = () =>
  recipeNote(first, { today: "2026-11-27", format: DEFAULT_FORMAT, source: "https://example.org/r" })
    .replace(/import: \w+/, "import: offen")
    .replace("typ: rezept", "typ: rezept\nauftrag: rz-m1-0001");
/** A first version without steps (the note's empty placeholder "1. "). */
export const partialVersion = () => firstVersion().replace(/## Schritte[\s\S]*?(?=\n## )/, "## Schritte\n1. ");
export const proposalText = (extra = "", state = "fertig", error = "") =>
  recipeNote(better, { today: "2026-11-28", format: DEFAULT_FORMAT })
    .replace(/import: \w+/, `import: ${state}`)
    .replace(/import_fehler:.*/, `import_fehler: ${error}`)
    .replace("typ: rezept", `typ: rezept\nauftrag: rz-m1-0001${extra}`);

export const job = (o: Partial<Job> = {}): Job => ({
  id: "rz-m1-0001",
  input: "https://example.org/r",
  kind: "webseite",
  since: 1,
  processor: "claude",
  device: "d1",
  improve: true,
  ...o,
});

export function setup(files: Record<string, string>, jobs: Job[] = [job()], device = "d1") {
  const store = new Map(Object.entries(files));
  const objects = new Map<string, TFile>();
  const trashed: string[] = [];
  /** Obsidian's local storage: survives a "restart" (a second service on the same fake). */
  const storage = new Map<string, string>();
  /** Handlers the service registers, by event name ("create", "modify", …; "mc:changed" for the metadata cache). */
  const events: Record<string, ((...a: unknown[]) => void)[]> = {};
  const on = (prefix: string) => (name: string, cb: (...a: unknown[]) => void) => {
    (events[prefix + name] ??= []).push(cb);
    return { name };
  };
  /** Paths Obsidian has not indexed yet (no cache entry). */
  const uncached = new Set<string>();
  const fileOf = (p: string) => {
    if (!store.has(p)) return null;
    if (!objects.has(p)) objects.set(p, new (TFile as unknown as new (p: string) => TFile)(p));
    return objects.get(p)!;
  };
  /** The folder `dir` of the fake vault: its files and the folders below (made from the paths in the store). */
  const folder = (dir: string): { name: string; children: unknown[] } => ({
    name: dir.split("/").pop()!,
    get children() {
      const names = new Map<string, boolean>();
      for (const p of store.keys()) {
        const rest = dir ? (p.startsWith(`${dir}/`) ? p.slice(dir.length + 1) : null) : p;
        if (rest === null) continue;
        const [first, ...more] = rest.split("/");
        names.set(first, names.get(first) || more.length > 0);
      }
      return [...names].map(([n, isDir]) => (isDir ? folder(dir ? `${dir}/${n}` : n) : { name: n }));
    },
  });
  const folderAt = (dir: string) =>
    dir === FOLDER || [...store.keys()].some((p) => p.startsWith(`${dir}/`)) ? folder(dir) : null;
  const plugin = {
    settings: { folder: FOLDER, jobs, coverUrls: {} as Record<string, string> },
    save: async (s: { jobs?: Job[] }) => {
      if (s.jobs) plugin.settings.jobs = s.jobs;
    },
    lists: { isListNote: () => false },
    noteFormat: () => DEFAULT_FORMAT,
    extraProperties: () => [] as [string, string][],
    settingsViews: { refresh: vi.fn() },
    registerEvent: vi.fn(),
    app: {
      loadLocalStorage: (k: string) => (k === "better-cooking-device" ? device : storage.get(k)),
      saveLocalStorage: (k: string, v: string) => void storage.set(k, v),
      workspace: { onLayoutReady: (cb: () => void) => cb() },
      vault: {
        on: on(""),
        getAbstractFileByPath: (p: string) => fileOf(p),
        getFileByPath: (p: string) => fileOf(p),
        getMarkdownFiles: () => [...store.keys()].filter((p) => p.endsWith(".md")).map((p) => fileOf(p)!),
        getFolderByPath: folderAt,
        getRoot: () => folder(""),
        createFolder: async () => undefined,
        read: async (f: TFile) => store.get(f.path)!,
        cachedRead: async (f: TFile) => store.get(f.path)!,
        getFiles: () => [...store.keys()].map((p) => fileOf(p)!),
        create: async (p: string, t: string) => {
          store.set(p, t);
          return fileOf(p)!;
        },
        process: async (f: TFile, fn: (t: string) => string) => void store.set(f.path, fn(store.get(f.path)!)),
      },
      metadataCache: {
        resolvedLinks: {} as Record<string, Record<string, number>>,
        getFileCache: (f: TFile) =>
          uncached.has(f.path) ? null : { frontmatter: readFrontmatter(store.get(f.path) ?? "").fm },
        on: on("mc:"),
        offref: vi.fn(),
      },
      fileManager: {
        trashFile: async (f: TFile) => {
          store.delete(f.path);
          objects.delete(f.path);
          trashed.push(f.path);
        },
        renameFile: async (f: TFile, to: string) => {
          store.set(to, store.get(f.path)!);
          store.delete(f.path);
          objects.delete(f.path);
          f.path = to;
          f.name = to.split("/").pop()!;
          objects.set(to, f);
        },
      },
    },
  };
  const service = () => new ImproveService(plugin as never);
  const fire = (name: string, ...a: unknown[]) => (events[name] ?? []).forEach((cb) => cb(...a));
  return {
    service: service(),
    another: service,
    plugin,
    store,
    trashed,
    uncached,
    events,
    fire,
    storage,
    file: fileOf,
    text: (p: string) => store.get(p)!,
  };
}

export const backups = (s: ReturnType<typeof setup>) => [...s.store.keys()].filter((k) => k.includes("/Vorversionen/"));
