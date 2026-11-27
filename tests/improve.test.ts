import { describe, expect, it } from "vitest";
import {
  IMPROVE_DIR,
  imageNameFor,
  improveDecision,
  isProposalPath,
  markImproveFailed,
  proposalImages,
  readProposal,
  safeSource,
  schemaFromRecipe,
  targetOf,
  withTimeline,
} from "../src/improve";
import { checkImportedNote } from "../src/importCheck";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { parseRecipe } from "../src/parse";
import { recipeNote } from "../src/recipeNote";
import type { SchemaRecipe } from "../src/schemaorg";

const EN = makeNoteFormat("en").format;
const DE = DEFAULT_FORMAT;

const DE_PROPOSAL = `---
typ: rezept
status: ausprobieren
quelle: "https://example.org/r"
ergebnis: 4 Portionen
zeit_aktiv: 20
auftrag: rz-abc
import: fertig
import_fehler:
---
# Linsensuppe

Wärmt von innen.

## Zutaten
**Suppe**
- 250 g rote Linsen
- 1 Zwiebel

## Schritte
1. **Anschwitzen (5 Min.):** Zwiebel glasig dünsten.
2. **Kochen (15 Min.):** Linsen zugeben.

## Tipps
- Mit Zitrone abschmecken.
`;

const EN_PROPOSAL = `---
type: recipe
job: rz-abc
import: failed
import_error: "Video had no recipe"
---
# Lentil soup

## Ingredients
- 250 g red lentils

## Steps
1. Cook.
`;

describe("isProposalPath", () => {
  it("accepts Markdown files directly in the proposals folder of the recipe folder", () => {
    expect(IMPROVE_DIR).toBe("Verbesserungen");
    expect(isProposalPath("Rezepte/Verbesserungen/rz-abc.md", "Rezepte")).toBe(true);
    expect(isProposalPath("Verbesserungen/rz-abc.md", "")).toBe(true);
    expect(isProposalPath("Rezepte/Verbesserungen/rz-abc.MD", "Rezepte")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isProposalPath("Rezepte/Verbesserungen/sub/rz-abc.md", "Rezepte")).toBe(false);
    expect(isProposalPath("Rezepte/Verbesserungen/Bilder.png", "Rezepte")).toBe(false);
    expect(isProposalPath("Rezepte/rz-abc.md", "Rezepte")).toBe(false);
    expect(isProposalPath("Rezepte/Vorversionen/rz-abc.md", "Rezepte")).toBe(false);
    expect(isProposalPath("Anderes/Verbesserungen/rz-abc.md", "Rezepte")).toBe(false);
  });
});

describe("readProposal", () => {
  it("reads the German names", () => {
    const p = readProposal(DE_PROPOSAL, DE.fields, "Rezepte/Verbesserungen/rz-abc.md");
    expect(p.job).toBe("rz-abc");
    expect(p.state).toBe("fertig");
    expect(p.error).toBeUndefined();
    expect(p.recipe.title).toBe("Linsensuppe");
    expect(p.recipe.steps).toHaveLength(2);
    expect(p.findings).toEqual([]);
  });
  it("reads the English names and the failure reason", () => {
    const p = readProposal(EN_PROPOSAL, EN.fields);
    expect(p.job).toBe("rz-abc");
    expect(p.state).toBe("fehler");
    expect(p.error).toBe("Video had no recipe");
  });
  it("reads both languages whatever the format says", () => {
    expect(readProposal(EN_PROPOSAL, DE.fields).state).toBe("fehler");
    expect(readProposal(DE_PROPOSAL, EN.fields).job).toBe("rz-abc");
  });
  it("takes the job ID from the file name when the note has none", () => {
    const p = readProposal("# Brot\n\n## Zutaten\n- 500 g Mehl\n", DE.fields, "R/Verbesserungen/rz-xyz.md");
    expect(p.job).toBe("rz-xyz");
  });
  it("is partial without ingredients or steps, with the reason", () => {
    const p = readProposal(
      "---\nauftrag: rz-1\nimport_fehler: Zutaten fehlen\n---\n# Brot\n\n## Zutaten\n- 1 Ei\n",
      DE.fields,
    );
    expect(p.state).toBe("teilweise");
    expect(p.error).toBe("Zutaten fehlen");
  });
  it("reads 'offen' in a proposal as partial: it makes no sense there", () => {
    expect(readProposal("---\nauftrag: rz-1\nimport: offen\n---\n# Brot\n", DE.fields).state).toBe("teilweise");
  });
  it("reports import-check findings", () => {
    const p = readProposal(DE_PROPOSAL.replace("Zwiebel glasig", "<% tp.x %> Zwiebel glasig"), DE.fields);
    expect(p.findings).toEqual(["templater"]);
  });
});

const source: SchemaRecipe = {
  title: "Brot",
  description: "Knusprig.",
  author: "Anna",
  category: "Brot",
  result: "1 Brot",
  timeActive: 20,
  timeTotal: 180,
  ingredients: ["500 g Mehl", "10 g Salz", "1 Ei"],
  ingredientGroups: [
    { title: "Teig", ingredients: ["500 g Mehl", "10 g Salz"] },
    { title: "Glasur", ingredients: ["1 Ei"] },
  ],
  steps: [{ title: "Kneten (10 Min.)", text: "Teig kneten." }, { text: "Backen." }],
  tips: ["Frisch essen."],
  images: [],
};

describe("schemaFromRecipe", () => {
  it("round-trips a recipe through the note format", () => {
    const text = recipeNote(source, { today: "2026-11-27", format: DE });
    const back = schemaFromRecipe(readProposal(text, DE.fields).recipe);
    expect(back).toMatchObject({
      title: "Brot",
      description: "Knusprig.",
      author: "Anna",
      category: "Brot",
      result: "1 Brot",
      timeActive: 20,
      timeTotal: 180,
      ingredients: source.ingredients,
      ingredientGroups: source.ingredientGroups,
      steps: source.steps,
      tips: source.tips,
      images: [],
    });
  });
  it("round-trips in English too, with flat ingredients", () => {
    const flat: SchemaRecipe = { ...source, ingredientGroups: undefined };
    const back = schemaFromRecipe(
      readProposal(recipeNote(flat, { today: "2026-11-27", format: EN }), EN.fields).recipe,
    );
    expect(back.ingredients).toEqual(source.ingredients);
    expect(back.ingredientGroups).toBeUndefined();
  });
  it("never invents a title", () => {
    expect(schemaFromRecipe(readProposal("---\nauftrag: rz-1\n---\n", DE.fields).recipe).title).toBe("Rezept");
  });
  it("defuses what a processor wrote, like an import", () => {
    const evil = `---
auftrag: rz-1
import: fertig
---
# <% tp.system.prompt() %>

Siehe [[Geheim]] und [x](obsidian://open?vault=a).

## Zutaten
- ![[Passwörter]]
- \`= dv.pages()\`

## Schritte
1. **<script>** Erst <iframe src="x"> dann [[Notiz]] öffnen.
2. # Überschrift
`;
    const proposal = readProposal(evil, DE.fields);
    expect(proposal.findings.length).toBeGreaterThan(0);
    const rendered = recipeNote(schemaFromRecipe(proposal.recipe), { today: "2026-11-27", format: DE });
    // The check is conservative and also flags an inert "< script"; what can act in the vault is gone.
    expect(checkImportedNote(rendered).filter((f) => f !== "html")).toEqual([]);
    expect(rendered).not.toMatch(/<(%|script|iframe)/i);
    expect(rendered).not.toContain("obsidian://open");
    expect(rendered).not.toMatch(/\[\[Geheim\]\]|!\[\[Pass/);
  });
});

describe("targetOf", () => {
  const notes = [
    { path: "R/A.md", job: "rz-1", importState: "fehler" },
    { path: "R/B.md", job: "rz-2" },
    { path: "R/C.md", job: " rz-1 " },
  ];
  it("finds the note by its job ID", () => {
    expect(targetOf("rz-2", notes)?.path).toBe("R/B.md");
    expect(targetOf("rz-1", notes)?.path).toBe("R/C.md");
  });
  it("finds nothing for an unknown job and never a failure note", () => {
    expect(targetOf("rz-9", notes)).toBeUndefined();
    expect(targetOf("rz-1", [notes[0]])).toBeUndefined();
  });
});

describe("improveDecision", () => {
  const base = {
    job: { device: "d1" } as { device?: string; dropped?: true },
    thisDevice: "d1" as string | null,
    target: {},
    editedChanged: false,
    findings: [] as never[],
  };
  it("applies on the starting device when nothing edited changes and nothing is suspicious", () => {
    expect(improveDecision(base)).toBe("apply");
  });
  it("asks when a part edited by hand would change", () => {
    expect(improveDecision({ ...base, editedChanged: true })).toBe("review");
  });
  it("asks when the proposal has findings", () => {
    expect(improveDecision({ ...base, findings: ["link"] })).toBe("review");
  });
  it("asks on another device, without a device ID, and without a known job", () => {
    expect(improveDecision({ ...base, thisDevice: "d2" })).toBe("review");
    expect(improveDecision({ ...base, thisDevice: null })).toBe("review");
    expect(improveDecision({ ...base, job: { device: undefined } })).toBe("review");
    expect(improveDecision({ ...base, job: undefined })).toBe("review");
  });
  it("is an orphan without a note", () => {
    expect(improveDecision({ ...base, target: undefined })).toBe("orphan");
    expect(improveDecision({ ...base, target: undefined, thisDevice: "d2" })).toBe("orphan");
  });
  it("drops the proposal of a dropped job, before anything else", () => {
    expect(improveDecision({ ...base, job: { device: "d1", dropped: true } })).toBe("drop");
    expect(improveDecision({ ...base, job: { dropped: true }, target: undefined })).toBe("drop");
    expect(improveDecision({ ...base, job: { dropped: true }, thisDevice: "d2", editedChanged: true })).toBe("drop");
  });
});

describe("failure of an improvement", () => {
  const first = "---\ntyp: rezept\nauftrag: rz-1\nimport: offen\nimport_fehler:\nerstellt: 2026-11-27\n---\n# Brot\n";
  it("sets partial and the reason when the note still waits for this job", () => {
    const next = markImproveFailed(first, "rz-1", "Video ohne Rezept", DE)!;
    const r = parseRecipe("x", next, 0, DE.fields);
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toBe("Video ohne Rezept");
    expect(r.job).toBe("rz-1");
    expect(next).toContain("# Brot");
  });
  it("adds the fields if the note had none, in the format's language", () => {
    const next = markImproveFailed("---\njob: rz-1\nimport: open\n---\n# Bread\n", "rz-1", "No recipe", EN)!;
    expect(next).toContain("import: partial");
    expect(next).toContain('import_error: "No recipe"');
  });
  it("is a compare-and-set on the job ID and 'offen'", () => {
    expect(markImproveFailed(first, "rz-2", "x", DE)).toBeNull();
    expect(markImproveFailed(first.replace("offen", "fertig"), "rz-1", "x", DE)).toBeNull();
    expect(markImproveFailed("# Brot\n", "rz-1", "x", DE)).toBeNull();
  });
  it("keeps the line ending and writes one line", () => {
    const next = markImproveFailed(first.replace(/\n/g, "\r\n"), "rz-1", "a\nb", DE)!;
    expect(next).toContain("\r\n");
    expect(next).toContain('import_fehler: "a b"');
  });
});

describe("images and sections", () => {
  it("names the images of a proposal after its job ID", () => {
    const i = proposalImages("rz-1", "Rezepte");
    expect(i.covers[0]).toBe("Rezepte/Bilder/rz-1 Titelbild.webp");
    expect(i.timeline).toBe("Rezepte/Bilder/rz-1 Ablauf.svg");
    expect(proposalImages("rz-1", "").timeline).toBe("Bilder/rz-1 Ablauf.svg");
  });
  it("names them after the note when they move in", () => {
    expect(imageNameFor("Brot", "cover", "webp")).toBe("Brot Titelbild.webp");
    expect(imageNameFor("Brot", "cover", "webp", 2)).toBe("Brot Titelbild 2.webp");
    expect(imageNameFor("Brot", "timeline", "svg")).toBe("Brot Ablauf.svg");
  });
  it("adds the timeline before the first section, once", () => {
    const text = "---\ntyp: rezept\n---\n# Brot\n\n## Zutaten\n- Mehl\n";
    const next = withTimeline(text, "de", "Brot Ablauf.svg");
    expect(next.indexOf("## Ablauf")).toBeLessThan(next.indexOf("## Zutaten"));
    expect(parseRecipe("x", next).timeline).toBe("Brot Ablauf.svg");
    expect(withTimeline(next, "de", "Anderes.svg")).toBe(next);
    expect(withTimeline(text, "en", "B.svg")).toContain("## Timeline");
  });
  it("accepts only web addresses as a source", () => {
    expect(safeSource("https://example.org/a")).toBe("https://example.org/a");
    expect(safeSource("javascript:alert(1)")).toBeUndefined();
    expect(safeSource("obsidian://open")).toBeUndefined();
    expect(safeSource(undefined)).toBeUndefined();
  });
});
