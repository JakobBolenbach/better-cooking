import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkImportedNote } from "../src/importCheck";
import { parseRecipe } from "../src/parse";
import { defuse, recipeNote } from "../src/recipeNote";
import { recipeFromSchema } from "../src/schemaorg";
import { makeNoteFormat } from "../src/noteFormat";

const note = (body: string) => `---\ntyp: rezept\nimport: fertig\n---\n# Test\n\n${body}\n`;

describe("checkImportedNote", () => {
  it("finds nothing in a plain recipe with images and a timeline", () => {
    const text = note(
      [
        "![[Brot Titelbild.webp]]",
        "",
        "Quelle: [example.org](https://example.org/brot)",
        "## Ablauf",
        "![[Brot Ablauf.svg]]",
        "## Zutaten",
        "- 500 g Mehl, <5 % Kleie",
        "## Versuche",
        "> Neueste oben: `### TT.MM.JJJJ`, was geändert, Ergebnis, Bewertung 1 bis 5.",
        "## Notizen",
        "- [Video](https://example.org/v) und mailto: [Mail](mailto:a@example.org), [oben](#Zutaten)",
      ].join("\n"),
    );
    expect(checkImportedNote(text)).toEqual([]);
  });

  it("finds code that other plugins run", () => {
    expect(checkImportedNote(note("<% tp.system.prompt() %>"))).toEqual(["templater"]);
    expect(checkImportedNote(note("<%* await app.vault.delete() %>"))).toEqual(["templater"]);
    expect(checkImportedNote(note("```dataviewjs\ndv.paragraph(1)\n```"))).toEqual(["code"]);
    expect(checkImportedNote(note("~~~js\nx\n~~~"))).toEqual(["code"]);
    expect(checkImportedNote(note("Menge: `$= dv.pages().length`"))).toEqual(["inlineQuery"]);
    expect(checkImportedNote(note("Menge: `= this.file.name`"))).toEqual(["inlineQuery"]);
  });

  it("finds active HTML, action links and embedded notes", () => {
    expect(checkImportedNote(note('<iframe src="https://example.org"></iframe>'))).toEqual(["html"]);
    expect(checkImportedNote(note("<img src=x onerror=alert(1)>"))).toEqual(["html"]);
    expect(checkImportedNote(note("[Klick](obsidian://advanced-uri?commandid=x)"))).toEqual(["link"]);
    expect(checkImportedNote(note("[Klick](javascript:alert(1))"))).toEqual(["link"]);
    expect(checkImportedNote(note("Siehe obsidian://open?vault=x"))).toEqual(["link"]);
    expect(checkImportedNote(note("![[Passwörter]]"))).toEqual(["embed"]);
    expect(checkImportedNote(note("![[Tagebuch#Geheim]]"))).toEqual(["embed"]);
  });

  it("lists each kind once in a fixed order", () => {
    expect(checkImportedNote(note("![[A]] ![[B]] <script></script> <% x %>"))).toEqual(["templater", "html", "embed"]);
  });
});

describe("parseRecipe", () => {
  it("reports findings for imported notes only", () => {
    const hostile = "# X\n\n<% tp.file.title %>\n";
    expect(parseRecipe("x.md", `---\nauftrag: rz-1\n---\n${hostile}`).findings).toEqual(["templater"]);
    expect(parseRecipe("x.md", `---\nimport: done\n---\n${hostile}`).findings).toEqual(["templater"]);
    expect(parseRecipe("x.md", `---\nstatus: bewaehrt\n---\n${hostile}`).findings).toBeUndefined();
  });

  it("finds nothing in the example recipes", () => {
    for (const f of ["sauerteig.md", "broetchen.md"]) {
      const text = readFileSync(`tests/fixtures/${f}`, "utf8");
      expect(checkImportedNote(text), f).toEqual([]);
    }
  });
});

describe("notes from hostile pages", () => {
  const page = {
    "@type": "Recipe",
    name: "Kuchen <% tp.system.prompt() %>",
    description: "Lecker. `$= dv.pages()` [Klick](obsidian://advanced-uri?commandid=app:delete-file)",
    recipeIngredient: ["```dataviewjs", "Mehl [x](javascript:alert(1))", "<%* app.vault.delete() %>"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Rühren `= this.file.name`" }],
  };
  const r = recipeFromSchema(page, "https://example.org");

  it("are clean in both note formats", () => {
    for (const lang of ["de", "en"] as const) {
      const text = recipeNote(r, {
        source: "https://example.org/x",
        today: "2026-11-26",
        format: makeNoteFormat(lang).format,
      });
      expect(checkImportedNote(text), lang).toEqual([]);
      expect(parseRecipe("x.md", text).findings).toBeUndefined();
    }
  });

  it("keep the text readable", () => {
    expect(defuse("1 `Tasse` Mehl")).toBe("1 \\`Tasse\\` Mehl");
    expect(defuse("[a](obsidian://x)")).toBe("[a]\\(obsidian\u200b://x)");
    expect(defuse("<% x %>")).toBe("< % x %>");
  });
});
