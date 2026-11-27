import { describe, expect, it } from "vitest";
import {
  backupsOf,
  entriesByDay,
  futurePlanEntries,
  canvasLinks,
  planDelete,
  orphanedImages,
  planLinkMatcher,
  translationsOf,
} from "../src/deletePlan";

const brot = { path: "Rezepte/Brot.md", name: "Brot" };

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
    expect(backupsOf(brot, files, "Rezepte")).toEqual([
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02) 2.md",
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md",
    ]);
  });

  it("lets the link of the backup decide when there is one", () => {
    const linked = [
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md", link: "[[Rezepte/Brot]]" },
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-02-02).md", link: "[[Roggenbrot]]" },
      { path: "Rezepte/Vorversionen/Neuer Name (Vorversion 2026-03-02).md", link: "[[Brot|alias]]" },
    ];
    expect(backupsOf(brot, linked, "Rezepte")).toEqual([
      "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md",
      "Rezepte/Vorversionen/Neuer Name (Vorversion 2026-03-02).md",
    ]);
  });

  it("works with the recipe folder at the top of the vault", () => {
    expect(
      backupsOf({ path: "Brot.md", name: "Brot" }, [{ path: "Vorversionen/Brot (Vorversion 2026-01-02).md" }], ""),
    ).toEqual(["Vorversionen/Brot (Vorversion 2026-01-02).md"]);
  });
});

describe("translationsOf", () => {
  it("finds notes whose link points to the recipe", () => {
    const notes = [
      { path: "Rezepte/Bread.md", link: "[[Brot]]" },
      { path: "Rezepte/Pan.md", link: "[[Rezepte/Brot|x]]" },
      { path: "Rezepte/Cake.md", link: "[[Kuchen]]" },
      { path: "Rezepte/Brot.md" },
    ];
    expect(translationsOf(brot, notes)).toEqual(["Rezepte/Bread.md", "Rezepte/Pan.md"]);
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

  it("never takes a file outside Bilder or a note", () => {
    const outside = { "Rezepte/Brot.md": { "Fotos/a.jpg": 1, "Rezepte/Anderes.md": 1, "Rezepte/Bilderbuch/b.jpg": 1 } };
    expect(orphanedImages(["Rezepte/Brot.md"], outside, "Rezepte")).toEqual([]);
  });
});

describe("plan entries", () => {
  const plan =
    "## 2026-11-26\n- [[Brot]]\n\n## 2026-11-27 · Freitag\n- [[Brot]] · 2\n- [[Kuchen]]\n\n## 2026-11-29\n- [[Rezepte/Brot]]\n- [[Brot (Vorversion)]]\n";

  it("matches by the resolution of Obsidian, otherwise by name or path", () => {
    const m = planLinkMatcher([brot], (t) => (t === "Brot (Vorversion)" ? "Rezepte/Vorversionen/x.md" : undefined));
    expect(m("Brot")).toBe(true);
    expect(m("Rezepte/Brot")).toBe(true);
    expect(m("Brot (Vorversion)")).toBe(false);
    expect(m("Kuchen")).toBe(false);
    expect(planLinkMatcher([brot], () => "Rezepte/Brot.md")("Anything")).toBe(true);
    expect(planLinkMatcher([brot], () => "Elsewhere/Brot.md")("Brot")).toBe(false);
  });

  it("lists the entries from today on, grouped by day", () => {
    const rows = futurePlanEntries(plan, "2026-11-27", planLinkMatcher([brot]));
    expect(rows.map((r) => r.date)).toEqual(["2026-11-27", "2026-11-29"]);
    expect(entriesByDay(rows)).toEqual([
      { date: "2026-11-27", targets: ["Brot"] },
      { date: "2026-11-29", targets: ["Rezepte/Brot"] },
    ]);
  });
});

describe("links need to be links", () => {
  it("counts plain text as no link, resolves where it can", () => {
    const notes = [
      { path: "Rezepte/Plain.md", link: "Brot" },
      { path: "Rezepte/Real.md", link: "[[Brot]]" },
      { path: "Rezepte/Other.md", link: "[[Brot]]" },
    ];
    expect(translationsOf(brot, notes)).toEqual(["Rezepte/Other.md", "Rezepte/Real.md"]);
    // Obsidian says the link of Other.md leads to another note called Brot
    const resolve = (_t: string, from: string) =>
      from === "Rezepte/Other.md" ? "Elsewhere/Brot.md" : "Rezepte/Brot.md";
    expect(translationsOf(brot, notes, resolve)).toEqual(["Rezepte/Real.md"]);
  });
});

describe("canvasLinks", () => {
  it("reads the file nodes of a canvas, undefined for text that is no canvas", () => {
    const canvas = JSON.stringify({
      nodes: [
        { type: "file", file: "Rezepte/Bilder/a.jpg" },
        { type: "text", text: "x" },
        { type: "file", file: "Rezepte/Bilder/a.jpg" },
      ],
    });
    expect(canvasLinks(canvas)).toEqual({ "Rezepte/Bilder/a.jpg": 2 });
    expect(canvasLinks("{}")).toEqual({});
    expect(canvasLinks("not json")).toBeUndefined();
  });

  it("keeps an image a canvas shows", () => {
    const resolved = {
      "Rezepte/Brot.md": { "Rezepte/Bilder/a.jpg": 1 },
      "Plan.canvas": { "Rezepte/Bilder/a.jpg": 1 },
    };
    expect(orphanedImages(["Rezepte/Brot.md"], resolved, "Rezepte")).toEqual([]);
  });
});

describe("planDelete", () => {
  const input = {
    recipe: brot,
    withTranslations: true,
    folder: "Rezepte",
    today: "2026-11-27",
    recipes: [
      { path: "Rezepte/Brot.md", name: "Brot" },
      { path: "Rezepte/Bread.md", name: "Bread", link: "[[Brot]]" },
    ],
    versions: [{ path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md", link: "[[Brot]]" }],
    resolvedLinks: { "Rezepte/Brot.md": { "Rezepte/Bilder/a.jpg": 1 } },
    linksSure: true,
    planText: "## 2026-11-26\n- [[Brot]]\n\n## 2026-11-27\n- [[Brot]]\n- [[Bread]]\n",
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
});
