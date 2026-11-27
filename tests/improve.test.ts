import { describe, expect, it } from "vitest";
import {
  bannerFor,
  fingerprintKnown,
  improveDecision,
  isProposalPath,
  closeUnimproved,
  proposalImages,
  readProposal,
  schemaFromRecipe,
  startedHere,
  targetOf,
  withTimeline,
} from "../src/improve";
import { safeSource } from "../src/source";
import { IMPROVE_FOLDER, imageNameFor } from "../src/folder";
import { newJobId } from "../src/processor";
import { checkImportedNote } from "../src/importCheck";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { parseRecipe } from "../src/parse";
import { recipeNote } from "../src/recipeNote";
import type { SchemaRecipe } from "../src/schemaorg";

const EN = makeNoteFormat("en").format;
const DE = DEFAULT_FORMAT;

const PATH = "Rezepte/Verbesserungen/rz-k3j9x-abc1.md";

const DE_PROPOSAL = `---
typ: rezept
status: ausprobieren
quelle: "https://example.org/r"
ergebnis: 4 Portionen
zeit_aktiv: 20
auftrag: rz-k3j9x-abc1
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
job: rz-k3j9x-abc1
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
    expect(IMPROVE_FOLDER).toBe("Verbesserungen");
    expect(isProposalPath("Rezepte/Verbesserungen/rz-k3j9x-abc1.md", "Rezepte")).toBe(true);
    expect(isProposalPath("Verbesserungen/rz-k3j9x-abc1.md", "")).toBe(true);
    expect(isProposalPath("Rezepte/Verbesserungen/rz-k3j9x-abc1.MD", "Rezepte")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isProposalPath("Rezepte/Verbesserungen/sub/rz-k3j9x-abc1.md", "Rezepte")).toBe(false);
    expect(isProposalPath("Rezepte/Verbesserungen/Bilder.png", "Rezepte")).toBe(false);
    expect(isProposalPath("Rezepte/rz-k3j9x-abc1.md", "Rezepte")).toBe(false);
    expect(isProposalPath("Rezepte/Vorversionen/rz-k3j9x-abc1.md", "Rezepte")).toBe(false);
    expect(isProposalPath("Anderes/Verbesserungen/rz-k3j9x-abc1.md", "Rezepte")).toBe(false);
  });
});

describe("readProposal", () => {
  it("reads the German names", () => {
    const p = readProposal(DE_PROPOSAL, DE.fields, PATH);
    expect(p.job).toBe("rz-k3j9x-abc1");
    expect(p.valid).toBe(true);
    expect(p.state).toBe("fertig");
    expect(p.error).toBeUndefined();
    expect(p.recipe.title).toBe("Linsensuppe");
    expect(p.recipe.steps).toHaveLength(2);
    expect(p.findings).toEqual([]);
  });
  it("reads the English names and the failure reason", () => {
    const p = readProposal(EN_PROPOSAL, EN.fields, PATH);
    expect(p.job).toBe("rz-k3j9x-abc1");
    expect(p.valid).toBe(true);
    expect(p.state).toBe("fehler");
    expect(p.error).toBe("Video had no recipe");
  });
  it("reads both languages whatever the format says", () => {
    expect(readProposal(EN_PROPOSAL, DE.fields, PATH).state).toBe("fehler");
    expect(readProposal(DE_PROPOSAL, EN.fields, PATH).job).toBe("rz-k3j9x-abc1");
  });
  it("is invalid when the file name and the job ID of the note differ", () => {
    const other = "Rezepte/Verbesserungen/rz-k3j9x-zzzz.md";
    expect(readProposal(DE_PROPOSAL, DE.fields, other).valid).toBe(false);
    expect(readProposal("# Brot\n\n## Zutaten\n- 500 g Mehl\n", DE.fields, other).valid).toBe(false);
  });
  it("is invalid when the name is no job ID, even if both agree", () => {
    for (const bad of ["Lasagne", "rz-abc", "rz-k3j9x-abcde", "rz--abcd", "RZ-k3j9x-abc1", "rz-k3j9x-abc1 2"]) {
      const text = DE_PROPOSAL.replace("auftrag: rz-k3j9x-abc1", `auftrag: ${bad}`);
      expect(readProposal(text, DE.fields, `Rezepte/Verbesserungen/${bad}.md`).valid, bad).toBe(false);
    }
  });
  it("accepts every ID that newJobId makes", () => {
    for (const id of [newJobId(0, 0), newJobId(Date.now(), 0.999), newJobId(1e15, 0.5)])
      expect(readProposal(`---\nauftrag: ${id}\n---\n# B\n`, DE.fields, `V/${id}.md`).valid, id).toBe(true);
  });
  it("is partial without ingredients or steps, with the reason", () => {
    const p = readProposal(
      "---\nauftrag: rz-k3j9x-abc1\nimport_fehler: Zutaten fehlen\n---\n# Brot\n\n## Zutaten\n- 1 Ei\n",
      DE.fields,
      PATH,
    );
    expect(p.state).toBe("teilweise");
    expect(p.error).toBe("Zutaten fehlen");
  });
  it("reads 'offen' in a proposal as partial: it makes no sense there", () => {
    const text = "---\nauftrag: rz-k3j9x-abc1\nimport: offen\n---\n# Brot\n";
    expect(readProposal(text, DE.fields, PATH).state).toBe("teilweise");
  });
  it("reports import-check findings", () => {
    const p = readProposal(DE_PROPOSAL.replace("Zwiebel glasig", "<% tp.x %> Zwiebel glasig"), DE.fields, PATH);
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
    { path: "R/B.md", job: "rz-2", importState: "offen" },
    { path: "R/C.md", job: " rz-1 ", importState: "offen" },
    { path: "R/D.md", job: "rz-3", importState: "fertig" },
  ];
  it("finds the note that says 'offen' by its job ID", () => {
    expect(targetOf("rz-2", notes)?.path).toBe("R/B.md");
    expect(targetOf("rz-1", notes)?.path).toBe("R/C.md");
  });
  it("finds a note that is not 'offen' only for a known improvement job", () => {
    expect(targetOf("rz-3", notes)).toBeUndefined();
    expect(targetOf("rz-3", notes, true)?.path).toBe("R/D.md");
  });
  it("finds nothing for an unknown job and never a failure note", () => {
    expect(targetOf("rz-9", notes, true)).toBeUndefined();
    expect(targetOf("rz-1", [notes[0]], true)).toBeUndefined();
  });
  it("only skips a 'failed' note that really has no content", () => {
    const withContent = { path: "R/A.md", job: "rz-1", importState: "fehler", steps: [{ text: "Backen." }] };
    expect(targetOf("rz-1", [withContent], true)?.path).toBe("R/A.md");
  });
  it("takes the note with 'offen' when a second note carries the same job ID, whatever the order", () => {
    const both = [
      { path: "R/Aa.md", job: "rz-5", importState: "fertig" },
      { path: "R/Zz.md", job: "rz-5", importState: "offen" },
    ];
    expect(targetOf("rz-5", both, true)?.path).toBe("R/Zz.md");
    expect(targetOf("rz-5", [...both].reverse(), true)?.path).toBe("R/Zz.md");
    expect(targetOf("rz-5", both)?.path).toBe("R/Zz.md");
  });
  it("is deterministic without any 'offen' note: the first by path", () => {
    const two = [
      { path: "R/Zz.md", job: "rz-5", importState: "fertig" },
      { path: "R/Aa.md", job: "rz-5", importState: "teilweise" },
    ];
    expect(targetOf("rz-5", two, true)?.path).toBe("R/Aa.md");
  });
});

describe("fingerprintKnown", () => {
  it("is true for a fingerprint of this version", () => {
    const text = recipeNote(source, { today: "2026-11-27", format: DE });
    expect(fingerprintKnown(parseRecipe("x", text, 0, DE.fields))).toBe(true);
  });
  it("is false without one and for one of another version or a broken one", () => {
    expect(fingerprintKnown({})).toBe(false);
    expect(fingerprintKnown({ importHash: "v9;title:abc" })).toBe(false);
    expect(fingerprintKnown({ importHash: "kaputt" })).toBe(false);
  });
});

describe("improveDecision", () => {
  const base = {
    job: { device: "d1", improve: true as const } as { device?: string; improve?: true },
    thisDevice: "d1" as string | null,
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
    expect(improveDecision({ ...base, job: { device: undefined, improve: true } })).toBe("review");
    expect(improveDecision({ ...base, job: undefined })).toBe("review");
  });
  it("never applies for a job that is not an improvement job", () => {
    expect(improveDecision({ ...base, job: { device: "d1" } })).toBe("review");
    expect(startedHere({ device: "d1" }, "d1")).toBe(false);
    expect(startedHere({ device: "d1", improve: true }, "d1")).toBe(true);
  });
});

describe("failure of an improvement", () => {
  const first = "---\ntyp: rezept\nauftrag: rz-1\nimport: offen\nimport_fehler:\nerstellt: 2026-11-27\n---\n# Brot\n";
  it("sets partial and the reason when the note still waits for this job", () => {
    const next = closeUnimproved(first, "rz-1", "Video ohne Rezept", DE)!;
    const r = parseRecipe("x", next, 0, DE.fields);
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toBe("Der Text enthält keine Zutaten und Schritte. Video ohne Rezept");
    expect(r.job).toBe("rz-1");
    expect(next).toContain("# Brot");
  });
  it("adds the fields if the note had none, in the format's language", () => {
    const next = closeUnimproved("---\njob: rz-1\nimport: open\n---\n# Bread\n", "rz-1", "No recipe", EN)!;
    expect(next).toContain("import: partial");
    expect(next).toContain('import_error: "The text contains no ingredients and steps. No recipe"');
  });
  it("is a compare-and-set on the job ID and 'offen'", () => {
    expect(closeUnimproved(first, "rz-2", "x", DE)).toBeNull();
    expect(closeUnimproved(first.replace("offen", "fertig"), "rz-1", "x", DE)).toBeNull();
    expect(closeUnimproved("# Brot\n", "rz-1", "x", DE)).toBeNull();
  });
  it("keeps the line ending and writes one line", () => {
    const next = closeUnimproved(first.replace(/\n/g, "\r\n"), "rz-1", "a\nb", DE)!;
    expect(next).toContain("\r\n");
    expect(next).toContain("a b");
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

describe("bannerFor", () => {
  it("needs a job ID on the note (#144)", () => {
    expect(bannerFor(undefined, undefined, undefined)).toBeUndefined();
    expect(bannerFor("", undefined, undefined)).toBeUndefined();
  });
  it("ready for the review job, waiting for another device's job, else nothing", () => {
    expect(bannerFor("rz-a-0001", "rz-a-0001", undefined)).toBe("ready");
    expect(bannerFor("rz-a-0001", undefined, "rz-a-0001")).toBe("waiting");
    expect(bannerFor("rz-a-0001", "rz-b-0002", "rz-c-0003")).toBeUndefined();
  });
});
