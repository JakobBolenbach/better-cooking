import { beforeEach, describe, expect, it, vi } from "vitest";

const notices: string[] = [];
vi.mock("obsidian", () => {
  class TFile {
    stat = { mtime: 1 };
    basename: string;
    name: string;
    extension: string;
    constructor(public path: string) {
      this.name = path.split("/").pop()!;
      this.basename = this.name.replace(/\.[^.]+$/, "");
      this.extension = this.name.split(".").pop()!;
    }
  }
  class Notice {
    constructor(text: string) {
      notices.push(text);
    }
  }
  return { TFile, Notice };
});

import { TFile } from "obsidian";
import { RecipeDeleter } from "../src/deleteService";
import { setLanguage } from "../src/i18n";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { applyPlanEdit, type PlanEdit } from "../src/planEdit";
import { todayIso } from "../src/parse";

const today = todayIso();
const later = "2999-01-02";
const earlier = "2000-01-02";

interface Setup {
  frontmatter?: Record<string, Record<string, unknown>>;
  resolved?: Record<string, Record<string, number>>;
  failing?: string[];
  plan?: string;
  /** Obsidian has not read the links yet. */
  indexing?: boolean;
  canvas?: string;
}

const FILES = [
  "Rezepte/Brot.md",
  "Rezepte/Bread.md",
  "Rezepte/Kuchen.md",
  "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md",
  "Rezepte/Vorversionen/Kuchen (Vorversion 2026-01-02).md",
  "Rezepte/Bilder/Brot Titelbild.jpg",
  "Rezepte/Bilder/Brot Ablauf.svg",
  "Rezepte/Bilder/Geteilt.jpg",
  "Fotos/privat.jpg",
  "Wochenplan.md",
  "Board.canvas",
];

function fake(o: Setup = {}) {
  const tfiles = new Map(FILES.map((p) => [p, new (TFile as unknown as new (p: string) => TFile)(p)]));
  const trashed: string[] = [];
  let plan = o.plan ?? "";
  const edits: PlanEdit[] = [];
  const reads = { count: 0 };
  const plugin = {
    settings: { folder: "Rezepte" },
    noteFormat: () => DEFAULT_FORMAT,
    lists: {
      isListNote: (p: string) => p === "Wochenplan.md",
      mealPlanPath: () => "Wochenplan.md",
      readPlanText: async () => plan,
      editMealPlan: async (e: PlanEdit) => {
        edits.push(e);
        plan = applyPlanEdit(plan, e, "Wochenplan", "de");
        return { text: plan, changed: true };
      },
    },
    app: {
      workspace: { layoutReady: true },
      vault: {
        getAbstractFileByPath: (p: string) => tfiles.get(p) ?? null,
        getMarkdownFiles: () => [...tfiles.values()].filter((f) => f.path.endsWith(".md")),
        getFiles: () => [...tfiles.values()],
        cachedRead: async () => {
          reads.count++;
          return o.canvas ?? '{"nodes":[]}';
        },
      },
      metadataCache: {
        getFileCache: (f: { path: string }) =>
          o.indexing && f.path === "Rezepte/Kuchen.md"
            ? null
            : {
                frontmatter: o.frontmatter?.[f.path],
                headings: [{ level: 1, heading: f.path.replace(/^.*\/|\.md$/g, "") }],
              },
        resolvedLinks: o.resolved ?? {},
        getFirstLinkpathDest: (t: string) =>
          tfiles.get(`Rezepte/${t.replace(/^Rezepte\//, "")}.md`) ?? tfiles.get(`Rezepte/Bilder/${t}`) ?? null,
      },
      fileManager: {
        trashFile: async (f: { path: string }) => {
          if (o.failing?.includes(f.path)) throw new Error("locked");
          trashed.push(f.path);
          tfiles.delete(f.path);
        },
      },
    },
  };
  return { deleter: new RecipeDeleter(plugin as never), trashed, plan: () => plan, edits, reads };
}

const setup: Setup = {
  frontmatter: {
    "Rezepte/Bread.md": { uebersetzung_von: [["Brot"]], sprache: "English" },
    "Rezepte/Kuchen.md": { uebersetzung_von: "Brot" },
    "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md": { vorversion: "[[Brot]]" },
  },
  resolved: {
    "Rezepte/Brot.md": {
      "Rezepte/Bilder/Brot Titelbild.jpg": 2,
      "Rezepte/Bilder/Brot Ablauf.svg": 1,
      "Rezepte/Bilder/Geteilt.jpg": 1,
      "Fotos/privat.jpg": 1,
    },
    "Rezepte/Bread.md": { "Rezepte/Bilder/Brot Titelbild.jpg": 1 },
    "Rezepte/Kuchen.md": { "Rezepte/Bilder/Geteilt.jpg": 1 },
    "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md": { "Rezepte/Bilder/Brot Titelbild.jpg": 1 },
  },
  plan: `# Wochenplan\n\n## ${earlier}\n- [[Brot]]\n\n## ${today}\n- [[Brot]] · 4\n\n## ${later}\n- [[Kuchen]]\n- [[Bread]]\n`,
};

/** What the dialog does: reads the preview, then deletes what it showed. */
async function ask(f: ReturnType<typeof fake>, translations: boolean, title?: string) {
  const p = await f.deleter.preview("Rezepte/Brot.md", translations);
  if (!p.ok) throw new Error(p.message);
  return f.deleter.run("Rezepte/Brot.md", { translations, title, shown: p.shown });
}

beforeEach(() => {
  setLanguage("de");
  notices.length = 0;
});

describe("RecipeDeleter.preview", () => {
  it("lists what goes: images no kept note uses, backups, plan entries from today on", async () => {
    const f = fake(setup);
    const p = await f.deleter.preview("Rezepte/Brot.md", false);
    expect(p).toMatchObject({
      ok: true,
      title: "Brot",
      images: ["Brot Ablauf.svg"],
      backups: 1,
      translations: [{ path: "Rezepte/Bread.md", title: "Bread", language: "English" }],
      plan: [{ date: today, titles: ["Brot"] }],
    });
    expect(f.trashed).toEqual([]);
  });

  it("takes the shared cover and the plan entries of the translations along when they go", async () => {
    const p = await fake(setup).deleter.preview("Rezepte/Brot.md", true);
    expect(p).toMatchObject({
      images: ["Brot Ablauf.svg", "Brot Titelbild.jpg"],
      plan: [
        { date: today, titles: ["Brot"] },
        { date: later, titles: ["Bread"] },
      ],
    });
  });

  it("refuses what is no recipe note of the folder", async () => {
    const f = fake(setup);
    expect(await f.deleter.preview("Wochenplan.md")).toMatchObject({ ok: false });
    expect(await f.deleter.preview("Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md")).toMatchObject({
      ok: false,
    });
    expect(await f.deleter.preview("Rezepte/Fehlt.md")).toMatchObject({ ok: false });
  });
});

describe("RecipeDeleter.run", () => {
  it("trashes the note first, then translations, backups and images, then edits the plan", async () => {
    const f = fake(setup);
    expect(await ask(f, true)).toMatchObject({ ok: true, deleted: f.trashed });
    expect(f.trashed).toEqual([
      "Rezepte/Brot.md",
      "Rezepte/Bread.md",
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md",
      "Rezepte/Bilder/Brot Ablauf.svg",
      "Rezepte/Bilder/Brot Titelbild.jpg",
    ]);
    expect(f.trashed).not.toContain("Rezepte/Bilder/Geteilt.jpg");
    expect(f.trashed).not.toContain("Fotos/privat.jpg");
    expect(f.plan()).toBe(`# Wochenplan\n\n## ${earlier}\n- [[Brot]]\n\n## ${later}\n- [[Kuchen]]\n`);
    expect(notices).toEqual(["Gelöscht: Brot (+ 4 Dateien)"]);
  });

  it("keeps the translations when the user unchecks them", async () => {
    const f = fake(setup);
    await ask(f, false, "Brot");
    expect(f.trashed).not.toContain("Rezepte/Bread.md");
    expect(f.trashed).not.toContain("Rezepte/Bilder/Brot Titelbild.jpg");
    expect(f.plan()).toContain("[[Bread]]");
  });

  it("stops without any change when the note itself cannot be trashed", async () => {
    const f = fake({ ...setup, failing: ["Rezepte/Brot.md"] });
    const r = await ask(f, true);
    expect(r.ok).toBe(false);
    expect(f.trashed).toEqual([]);
    expect(f.edits).toEqual([]);
    expect(notices).toEqual(["„Brot“ konnte nicht gelöscht werden, nichts wurde verändert: locked"]);
  });

  it("deletes only what the dialog showed", async () => {
    const f = fake(setup);
    const p = await f.deleter.preview("Rezepte/Brot.md", false);
    if (!p.ok) throw new Error("no preview");
    const shown = {
      files: p.shown.files.filter((x) => !x.endsWith(".svg")),
      targets: [],
    };
    await f.deleter.run("Rezepte/Brot.md", { translations: false, shown });
    expect(f.trashed).toEqual(["Rezepte/Brot.md", "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md"]);
    expect(f.edits).toEqual([]);
    expect(f.plan()).toContain(`## ${today}`);
  });

  it("takes no image while Obsidian has not read all notes, and says so", async () => {
    const f = fake({ ...setup, indexing: true });
    const p = await f.deleter.preview("Rezepte/Brot.md", false);
    expect(p).toMatchObject({ ok: true, images: [], imagesKept: true, incomplete: true });
    await ask(f, false);
    expect(f.trashed.some((x) => x.includes("Bilder"))).toBe(false);
  });

  it("keeps an image a canvas shows, and all images when a canvas cannot be read", async () => {
    const shows = fake({ ...setup, canvas: JSON.stringify({ nodes: [{ file: "Rezepte/Bilder/Brot Ablauf.svg" }] }) });
    expect(await shows.deleter.preview("Rezepte/Brot.md", false)).toMatchObject({ images: [], imagesKept: false });
    const broken = fake({ ...setup, canvas: "{ kaputt" });
    expect(await broken.deleter.preview("Rezepte/Brot.md", false)).toMatchObject({ images: [], imagesKept: true });
  });

  it("keeps an image a text node of a canvas embeds, resolved from the canvas, and reads a canvas once per change", async () => {
    const f = fake({ ...setup, canvas: JSON.stringify({ nodes: [{ type: "text", text: "![[Brot Ablauf.svg]]" }] }) });
    const p = await f.deleter.preview("Rezepte/Brot.md", false);
    expect(p).toMatchObject({ images: [], imagesKept: false });
    await f.deleter.preview("Rezepte/Brot.md", true);
    expect(f.reads.count).toBe(1);
  });

  it("takes only translations that link to the recipe, not plain text", async () => {
    const p = await fake(setup).deleter.preview("Rezepte/Brot.md", true);
    expect(p).toMatchObject({ translations: [{ path: "Rezepte/Bread.md" }] });
  });

  it("goes on after a later failure and names what is left", async () => {
    const f = fake({ ...setup, failing: ["Rezepte/Bilder/Brot Ablauf.svg"] });
    expect(await ask(f, false)).toMatchObject({ ok: true });
    expect(f.trashed).toContain("Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md");
    expect(f.edits).toHaveLength(1);
    expect(notices).toEqual(["„Brot“ ist gelöscht. Nicht erledigt: Rezepte/Bilder/Brot Ablauf.svg"]);
  });

  it("works from the links it saw before the files went (they no longer resolve afterwards)", async () => {
    const f = fake(setup);
    await ask(f, false);
    expect(f.plan()).not.toContain(`## ${today}`);
    expect(f.plan()).toContain(`## ${earlier}\n- [[Brot]]`);
  });
});
