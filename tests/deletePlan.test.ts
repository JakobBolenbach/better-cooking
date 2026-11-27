import { describe, expect, it } from "vitest";
import {
  backupsOf,
  canvasLinks,
  deletable,
  entriesByDay,
  futurePlanEntries,
  orphanedImages,
  planDelete,
  planLinkMatcher,
  readCanvas,
  translationsOf,
  type Resolve,
} from "../src/deletePlan";

const brot = { path: "Rezepte/Brot.md", name: "Brot" };
/** Obsidian's resolution for this vault: links to Brot lead to the recipe, Alt/Brot and Fehlt lead nowhere. */
const resolve: Resolve = (t) => {
  const name = t.replace(/^.*\//, "");
  if (t === "Alt/Brot" || name === "Fehlt") return undefined;
  return name === "Brot" ? "Rezepte/Brot.md" : name === "Roggenbrot" ? "Rezepte/Roggenbrot.md" : `Rezepte/${name}.md`;
};

describe("backupsOf", () => {
  const files = [
    { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md" },
    { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02) 2.md" },
    { path: "Rezepte/Vorversionen/Brotchen (Vorversion 2026-01-02).md" },
    { path: "Rezepte/Vorversionen/Brot.md" },
    { path: "Rezepte/Vorversionen/alt/Brot (Vorversion 2026-01-02).md" },
    { path: "Rezepte/Brot (Vorversion 2026-01-02).md" },
    { path: "Other/Vorversionen/Brot (Vorversion 2026-01-02).md" },
    { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).png" },
  ];

  it("takes the exact name prefix, in the backup folder of the recipe folder only", () => {
    expect(backupsOf(brot, files, "Rezepte", resolve)).toEqual([
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02) 2.md",
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md",
    ]);
  });

  it("lets the link of the backup decide when there is one, and only as resolved", () => {
    const linked = [
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md", link: "Rezepte/Brot" },
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-02-02).md", link: "Roggenbrot" },
      { path: "Rezepte/Vorversionen/Neuer Name (Vorversion 2026-03-02).md", link: "Brot" },
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-04-02).md", link: "Alt/Brot" },
    ];
    expect(backupsOf(brot, linked, "Rezepte", resolve)).toEqual([
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md",
      "Rezepte/Vorversionen/Neuer Name (Vorversion 2026-03-02).md",
    ]);
  });

  it("works with the recipe folder at the top of the vault", () => {
    const top: Resolve = () => "Brot.md";
    expect(
      backupsOf({ path: "Brot.md", name: "Brot" }, [{ path: "Vorversionen/Brot (Vorversion 2026-01-02).md" }], "", top),
    ).toEqual(["Vorversionen/Brot (Vorversion 2026-01-02).md"]);
  });
});

describe("translationsOf", () => {
  it("finds notes whose link leads to the recipe, and none whose link leads nowhere", () => {
    const notes = [
      { path: "Rezepte/Bread.md", link: "Brot" },
      { path: "Rezepte/Pan.md", link: "Rezepte/Brot" },
      { path: "Rezepte/Cake.md", link: "Kuchen" },
      { path: "Rezepte/Alt.md", link: "Alt/Brot" },
      { path: "Rezepte/Brot.md" },
    ];
    expect(translationsOf(brot, notes, resolve)).toEqual(["Rezepte/Bread.md", "Rezepte/Pan.md"]);
  });

  it("goes by the file the link resolves to, not by the name", () => {
    const other: Resolve = () => "Elsewhere/Brot.md";
    expect(translationsOf(brot, [{ path: "Rezepte/Bread.md", link: "Brot" }], other)).toEqual([]);
  });
});

describe("orphanedImages", () => {
  const resolved = {
    "Rezepte/Brot.md": {
      "Rezepte/Bilder/Brot Titelbild.jpg": 2,
      "Rezepte/Bilder/Geteilt.jpg": 1,
      "Rezepte/Anderes.md": 1,
    },
    "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md": {
      "Rezepte/Bilder/Alt.jpg": 1,
      "Rezepte/Bilder/Brot Titelbild.jpg": 1,
    },
    "Rezepte/Bread.md": { "Rezepte/Bilder/Brot Titelbild.jpg": 1 },
    "Rezepte/Kuchen.md": { "Rezepte/Bilder/Geteilt.jpg": 1, "Rezepte/Bilder/Nie.jpg": 0 },
    "Notizen/x.md": { "Rezepte/Bilder/Nie.jpg": 0 },
  };
  const going = ["Rezepte/Brot.md", "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md"];

  it("takes images only when no kept note links to them, from the recipe and its backups", () => {
    expect(orphanedImages(going, resolved, "Rezepte")).toEqual(["Rezepte/Bilder/Alt.jpg"]);
  });

  it("takes the cover when the translation goes too", () => {
    expect(orphanedImages([...going, "Rezepte/Bread.md"], resolved, "Rezepte")).toEqual([
      "Rezepte/Bilder/Alt.jpg",
      "Rezepte/Bilder/Brot Titelbild.jpg",
    ]);
  });

  it("includes images in subfolders of Bilder, never files outside it", () => {
    const sub = {
      "Rezepte/Brot.md": { "Rezepte/Bilder/2026/a.jpg": 1, "Fotos/a.jpg": 1, "Rezepte/Bilderbuch/b.jpg": 1 },
    };
    expect(orphanedImages(["Rezepte/Brot.md"], sub, "Rezepte")).toEqual(["Rezepte/Bilder/2026/a.jpg"]);
  });
});

describe("canvases", () => {
  const canvas = JSON.stringify({
    nodes: [
      { type: "file", file: "Rezepte/Bilder/a.jpg" },
      {
        type: "text",
        text: "Schau ![[b.jpg]] und [[Brot|das Brot]] und ![x](Rezepte/Bilder/c%20d.jpg) und [web](https://example.org/e.jpg)",
      },
      { type: "file", file: "Rezepte/Bilder/a.jpg" },
    ],
  });

  it("reads file nodes and the links of text nodes, undefined for text that is no canvas", () => {
    expect(readCanvas(canvas)).toEqual({
      files: ["Rezepte/Bilder/a.jpg", "Rezepte/Bilder/a.jpg"],
      targets: ["b.jpg", "Brot", "Rezepte/Bilder/c d.jpg"],
    });
    expect(readCanvas("{}")).toEqual({ files: [], targets: [] });
    expect(readCanvas("not json")).toBeUndefined();
  });

  it("resolves text links from the canvas and keeps what they lead to", () => {
    const at = (t: string, from: string) =>
      from === "Plan.canvas" && t === "b.jpg" ? "Rezepte/Bilder/b.jpg" : undefined;
    const links = canvasLinks(readCanvas(canvas)!, "Plan.canvas", at);
    expect(links["Rezepte/Bilder/a.jpg"]).toBe(2);
    expect(links["Rezepte/Bilder/b.jpg"]).toBe(1);
    const resolved = {
      "Rezepte/Brot.md": { "Rezepte/Bilder/a.jpg": 1, "Rezepte/Bilder/b.jpg": 1, "Rezepte/Bilder/z.jpg": 1 },
      "Plan.canvas": links,
    };
    expect(orphanedImages(["Rezepte/Brot.md"], resolved, "Rezepte")).toEqual(["Rezepte/Bilder/z.jpg"]);
  });
});

describe("plan entries", () => {
  const plan =
    "## 2026-11-26\n- [[Brot]]\n\n## 2026-11-27 · Freitag\n- [[Brot]] · 2\n- [[Kuchen]]\n\n## 2026-11-29\n- [[Rezepte/Brot]]\n- [[Brot (Vorversion)]]\n- [[Alt/Brot]]\n";
  const at = (t: string) => (t === "Brot (Vorversion)" ? "Rezepte/Vorversionen/x.md" : resolve(t, "Plan.md"));

  it("matches by the resolution of Obsidian only", () => {
    const m = planLinkMatcher([brot], at);
    expect(m("Brot")).toBe(true);
    expect(m("Rezepte/Brot")).toBe(true);
    expect(m("Brot (Vorversion)")).toBe(false);
    expect(m("Kuchen")).toBe(false);
    expect(m("Alt/Brot")).toBe(false);
  });

  it("lists the entries from today on, grouped by day", () => {
    const rows = futurePlanEntries(plan, "2026-11-27", planLinkMatcher([brot], at));
    expect(entriesByDay(rows)).toEqual([
      { date: "2026-11-27", targets: ["Brot"] },
      { date: "2026-11-29", targets: ["Rezepte/Brot"] },
    ]);
  });
});

describe("planDelete and deletable", () => {
  const input = {
    recipe: brot,
    withTranslations: true,
    folder: "Rezepte",
    today: "2026-11-27",
    recipes: [
      { path: "Rezepte/Brot.md", name: "Brot" },
      { path: "Rezepte/Bread.md", name: "Bread", link: "Brot" },
    ],
    versions: [{ path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md", link: "Brot" }],
    resolve,
    resolvedLinks: { "Rezepte/Brot.md": { "Rezepte/Bilder/a.jpg": 1 } },
    linksSure: true,
    planText: "## 2026-11-26\n- [[Brot]]\n\n## 2026-11-27\n- [[Brot]]\n- [[Bread]]\n",
    planResolve: (t: string) => resolve(t, "Plan.md"),
  };

  it("collects translations, backups, images and plan entries", () => {
    const s = planDelete(input);
    expect(s.translations).toEqual(["Rezepte/Bread.md"]);
    expect(s.backups).toEqual(["Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md"]);
    expect(s.images).toEqual(["Rezepte/Bilder/a.jpg"]);
    expect(s.targets.sort()).toEqual(["Bread", "Brot"]);
    expect(s.imagesKept).toBe(false);
  });

  it("takes no image while the links are not sure, and keeps the translations out when they stay", () => {
    const s = planDelete({ ...input, linksSure: false, withTranslations: false });
    expect(s.images).toEqual([]);
    expect(s.imagesKept).toBe(true);
    expect(s.translations).toEqual([]);
    expect(s.allTranslations).toEqual(["Rezepte/Bread.md"]);
    expect(s.targets).toEqual(["Brot"]);
  });

  it("deletes the intersection of what was shown and what is there now", () => {
    const s = planDelete(input);
    const d = deletable(s, {
      files: ["Rezepte/Bilder/a.jpg", "Rezepte/Bilder/gone.jpg", "Rezepte/Other.md"],
      targets: ["Brot"],
    });
    expect(d.files).toEqual(["Rezepte/Bilder/a.jpg"]);
    expect([...d.targets]).toEqual(["Brot"]);
  });
});
