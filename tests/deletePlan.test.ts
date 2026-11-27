import { describe, expect, it } from "vitest";
import {
  backupsOf,
  entriesByDay,
  futurePlanEntries,
  linkOf,
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
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-01-02).md", link: "Rezepte/Brot" },
      { path: "Rezepte/Vorversionen/Brot (Vorversion 2026-02-02).md", link: "Roggenbrot" },
      { path: "Rezepte/Vorversionen/Neuer Name (Vorversion 2026-03-02).md", link: "Brot" },
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
      { path: "Rezepte/Bread.md", translationOf: "Brot" },
      { path: "Rezepte/Pan.md", translationOf: "Rezepte/Brot" },
      { path: "Rezepte/Cake.md", translationOf: "Kuchen" },
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

describe("linkOf", () => {
  it("reads links and plain text", () => {
    expect(linkOf("[[Brot|x]]")).toBe("Brot");
    expect(linkOf("Brot")).toBe("Brot");
    expect(linkOf("")).toBeUndefined();
    expect(linkOf(3)).toBeUndefined();
  });
});
