import { describe, expect, it } from "vitest";
import { listEntries, parseRecipe } from "../src/parse";
import { defuse } from "../src/recipeNote";
import { diffSection, type Want } from "../src/sectionDiff";
import { cleanTitle, safeText, unescapeLead } from "../src/lineEscape";

const item = (text: string): Want => ({ kind: "item", text });
const group = (title: string): Want => ({ kind: "group", title });
const step = (text: string, title?: string): Want => ({ kind: "step", text, title });

describe("tips and ingredients", () => {
  it("keeps unchanged items byte for byte (checkbox, indentation, hanging lines, hints)", () => {
    const lines = ["> Hint", "- [x] Eier", "  gut gekühlt", "* Mehl", "", "- Salz"];
    expect(diffSection(lines, "ingredients", [item("Eier"), item("Mehl"), item("Zucker")])).toEqual([
      "> Hint",
      "- [x] Eier",
      "  gut gekühlt",
      "* Mehl",
      "- Zucker",
      "",
    ]);
  });

  it("an inserted item goes after the item before it, a deleted one takes its hanging lines", () => {
    const lines = ["- a", "  note of a", "- b", "- c"];
    expect(diffSection(lines, "tips", [item("a note of a"), item("x"), item("c")])).toEqual([
      "- a",
      "  note of a",
      "- x",
      "- c",
    ]);
    expect(diffSection(lines, "tips", [item("b"), item("c")])).toEqual(["- b", "- c"]);
  });

  it("a changed item becomes one rendered line; a changed ingredient keeps the lines hanging below it", () => {
    expect(diffSection(["- [ ] 2 Eier", "  Größe M", "- Salz"], "ingredients", [item("3 Eier"), item("Salz")])).toEqual(
      ["- [ ] 3 Eier", "  Größe M", "- Salz"],
    );
    expect(diffSection(["- Tipp eins", "  und weiter", "- zwei"], "tips", [item("Tipp 1"), item("zwei")])).toEqual([
      "- Tipp 1",
      "- zwei",
    ]);
  });

  it("a moved item keeps its raw lines", () => {
    const lines = ["- [x] a", "  hang", "- b", "- c"];
    expect(diffSection(lines, "tips", [item("b"), item("c"), item("a hang")])).toEqual([
      "- b",
      "- c",
      "- [x] a",
      "  hang",
    ]);
  });

  it("keeps ### group headings and bold group lines; a new group is rendered with an empty line before it", () => {
    const lines = ["### Teig", "- Mehl", "", "**Füllung:**", "- Äpfel"];
    expect(
      diffSection(lines, "ingredients", [group("Teig"), item("Mehl"), group("Füllung"), item("Äpfel"), item("Zimt")]),
    ).toEqual(["### Teig", "- Mehl", "", "**Füllung:**", "- Äpfel", "- Zimt"]);
    expect(
      diffSection(lines, "ingredients", [
        group("Teig"),
        item("Mehl"),
        group("Guss"),
        item("Zucker"),
        group("Füllung"),
        item("Äpfel"),
      ]),
    ).toEqual(["### Teig", "- Mehl", "", "**Guss**", "- Zucker", "", "**Füllung:**", "- Äpfel"]);
  });

  it("a renamed group changes only its heading", () => {
    expect(diffSection(["### Teig", "- Mehl"], "ingredients", [group("Hefeteig"), item("Mehl")])).toEqual([
      "### Hefeteig",
      "- Mehl",
    ]);
  });

  it("an unrelated replacement is a removal and an insertion: the hanging lines do not move to it", () => {
    expect(diffSection(["- Eier", "  Größe M"], "ingredients", [item("Zucker")])).toEqual(["- Zucker"]);
  });

  it("an empty placeholder is replaced by the first new item", () => {
    expect(diffSection(["- "], "tips", [item("eins"), item("zwei")])).toEqual(["- eins", "- zwei"]);
    expect(diffSection(["1. "], "steps", [step("Rühren")])).toEqual(["1. Rühren"]);
  });

  it("fills a section without items after its hint and keeps one empty line before the next heading", () => {
    expect(diffSection(["> Hint"], "tips", [item("a")])).toEqual(["> Hint", "- a", ""]);
    expect(diffSection([], "tips", [item("a")])).toEqual(["- a", ""]);
    expect(diffSection(["> Hint", ""], "tips", [item("a")])).toEqual(["> Hint", "- a", ""]);
  });

  it("removing every item leaves what is no item", () => {
    expect(diffSection(["> Hint", "- a", "", "Text"], "tips", [])).toEqual(["> Hint", "", "Text"]);
  });

  it("an unchanged section stays the same lines", () => {
    const lines = ["### G", "- [/] a", "  x", "", "- b"];
    expect(diffSection(lines, "ingredients", [group("G"), item("a"), item("b")])).toEqual(lines);
  });

  it("keeps CRLF-free lines of free text between items", () => {
    expect(diffSection(["- a", "Freier Text", "- b"], "tips", [item("a"), item("b2")])).toEqual([
      "- a",
      "Freier Text",
      "- b2",
    ]);
  });
});

describe("steps", () => {
  const lines = ["1. **Kneten:** Teig kneten", "  und ruhen lassen", "2. [x] Backen", "3) Servieren"];
  const same = [step("Teig kneten und ruhen lassen", "Kneten"), step("Backen"), step("Servieren")];

  it("hanging lines are part of the text: unchanged stays, nothing is renumbered", () => {
    expect(diffSection(lines, "steps", same)).toEqual(lines);
  });

  it("a changed step is one line with its old number and delimiter, the others stay", () => {
    expect(diffSection(lines, "steps", [same[0], same[1], step("Heiß servieren")])).toEqual([
      "1. **Kneten:** Teig kneten",
      "  und ruhen lassen",
      "2. [x] Backen",
      "3) Heiß servieren",
    ]);
    expect(diffSection(lines, "steps", [step("Teig kneten", "Kneten"), same[1], same[2]])).toEqual([
      "1. **Kneten:** Teig kneten",
      "2. [x] Backen",
      "3) Servieren",
    ]);
  });

  it("an inserted step renumbers by changing only the numbers", () => {
    expect(diffSection(lines, "steps", [same[0], step("Kühlen"), same[1], same[2]])).toEqual([
      "1. **Kneten:** Teig kneten",
      "  und ruhen lassen",
      "2. Kühlen",
      "3. [x] Backen",
      "4) Servieren",
    ]);
  });

  it("a deleted and a moved step renumber; a moved step keeps its checkbox", () => {
    expect(diffSection(lines, "steps", [same[1], same[2]])).toEqual(["1. [x] Backen", "2) Servieren"]);
    expect(diffSection(lines, "steps", [same[1], same[0], same[2]])).toEqual([
      "1. [x] Backen",
      "2. **Kneten:** Teig kneten",
      "  und ruhen lassen",
      "3) Servieren",
    ]);
  });

  it("a ### heading, a hint and an embed between steps stay", () => {
    const l = ["> Hint", "1. a", "### Phase 2", "2. b", "![[x.png]]"];
    expect(diffSection(l, "steps", [step("a"), step("b2")])).toEqual([
      "> Hint",
      "1. a",
      "### Phase 2",
      "2. b2",
      "![[x.png]]",
    ]);
  });
});

describe("typed text is made structurally safe", () => {
  it("line breaks become spaces, a start that looks like structure is escaped", () => {
    expect(safeText("a\nb\r\nc")).toBe("a b c");
    expect(safeText("## X")).toBe("\\## X");
    expect(safeText("> Zitat")).toBe("\\> Zitat");
    expect(safeText("- x")).toBe("\\- x");
    expect(safeText("1. x")).toBe("\\1. x");
    expect(safeText("| a | b |")).toBe("\\| a | b |");
    expect(safeText("[ ] box")).toBe("\\[ ] box");
    expect(safeText("**fett** und mehr")).toBe("\\**fett** und mehr");
    expect(safeText("---")).toBe("\\---");
    expect(safeText("--")).toBe("\\--");
    expect(safeText("```js")).toBe("\\```js");
    expect(safeText("2 EL **Öl** und -5 °C")).toBe("2 EL **Öl** und -5 °C");
    expect(unescapeLead("\\**fett**")).toBe("**fett**");
    expect(unescapeLead("\\---")).toBe("---");
    expect(unescapeLead("\\## X")).toBe("## X");
    expect(unescapeLead("\\ordinary")).toBe("\\ordinary");
  });

  it("an item cannot create a section, a step or a second item", () => {
    for (const t of ["## Neu", "x\n## Neu\n- y", "1. eins\n2. zwei", "---"]) {
      const out = diffSection([], "tips", [item(t)]);
      expect(out).toHaveLength(2);
      expect(out[0].startsWith("- ")).toBe(true);
      expect(out.slice(0, 1).join("")).not.toMatch(/\n/);
    }
    expect(diffSection([], "tips", [item("## Neu")])[0]).toBe("- \\## Neu");
  });

  it("an escaped item is the same item the next time (no change)", () => {
    expect(diffSection(["- \\## Neu"], "tips", [item("## Neu")])).toEqual(["- \\## Neu"]);
  });

  it("titles lose stars, line breaks and the colon", () => {
    expect(cleanTitle(" **Teig**:\n")).toBe("Teig");
    expect(diffSection(["1. a"], "steps", [step("a", "Neu **x**:\nz")])[0]).toBe("1. **Neu x: z:** a");
  });
});

describe("edits keep the start of their line (M2)", () => {
  it("indentation, marker, checkbox and number stay, only the text is replaced", () => {
    expect(diffSection(["  * [x] 2 Eier"], "ingredients", [item("3 Eier")])).toEqual(["  * [x] 3 Eier"]);
    expect(diffSection(["2) [ ] Backen"], "steps", [step("Lange backen")])).toEqual(["2) [ ] Lange backen"]);
    expect(diffSection(["3. **Kneten:** Teig"], "steps", [step("Teig", "Rühren")])).toEqual(["3. **Rühren:** Teig"]);
    expect(diffSection(["### Teig", "- a"], "ingredients", [group("Hefeteig"), item("a")])).toEqual([
      "### Hefeteig",
      "- a",
    ]);
  });
});

describe("what counts as an edit (M3)", () => {
  it("a different ingredient is not an edit: the hanging lines go with the old one", () => {
    expect(diffSection(["- 2 Eier", "  Größe M"], "ingredients", [item("2 EL Öl")])).toEqual(["- 2 EL Öl"]);
  });

  it("amounts and units do not make two ingredients alike; a changed amount is an edit", () => {
    expect(diffSection(["- 200 g Mehl", "  Type 405"], "ingredients", [item("250 g Mehl")])).toEqual([
      "- 250 g Mehl",
      "  Type 405",
    ]);
    expect(diffSection(["- 200 g Mehl", "  Type 405"], "ingredients", [item("200 g Zucker")])).toEqual([
      "- 200 g Zucker",
    ]);
  });

  it("pairs only when old and new are as many in the gap", () => {
    const out = diffSection(["- Eier", "  M", "- Mehl"], "ingredients", [
      item("Eier groß"),
      item("Eier klein"),
      item("Mehl"),
    ]);
    expect(out).toEqual(["- Eier groß", "- Eier klein", "- Mehl"]);
  });
});

describe("one reader for the page and the editor (H1, M5)", () => {
  it("a tip with hanging lines has one key made of all its lines; an unchanged tip is untouched", () => {
    const lines = ["- Erster Tipp", "  und mehr dazu", "- Zweiter"];
    const [first] = listEntries(lines, "tips");
    expect(first.text).toBe("Erster Tipp und mehr dazu");
    expect(diffSection(lines, "tips", [item("Erster Tipp und mehr dazu"), item("Zweiter"), item("Dritter")])).toEqual([
      ...lines,
      "- Dritter",
    ]);
  });

  it("the page shows an escaped start without the backslash", () => {
    expect(listEntries(["- \\## X", "- \\* x"], "tips").map((e) => e.text)).toEqual(["## X", "* x"]);
    expect(listEntries(["1. \\**fett** und mehr"], "steps")[0].text).toBe("**fett** und mehr");
  });

  it("a placeholder is an empty entry; free text and hints are none", () => {
    const e = listEntries(["> Hint", "- ", "Freitext", "- a"], "tips");
    expect(e.map((x) => [x.empty, x.lines])).toEqual([
      [true, [1]],
      [false, [3]],
    ]);
  });
});

describe("numbering per phase (N5)", () => {
  it("a note that counts anew after each heading is renumbered per phase", () => {
    const lines = ["### Teig", "1. a", "2. b", "### Backen", "1. c"];
    expect(diffSection(lines, "steps", [step("a"), step("neu"), step("b"), step("c")])).toEqual([
      "### Teig",
      "1. a",
      "2. neu",
      "3. b",
      "### Backen",
      "1. c",
    ]);
  });
});

describe("group headings without ingredients stay (H1 round 3)", () => {
  it("an empty heading with text under it is left alone when an ingredient below changes", () => {
    const lines = ["**Leer**", "", "**Teig**", "- Mehl"];
    expect(diffSection(lines, "ingredients", [group("Teig"), item("250 g Mehl")])).toEqual([
      "**Leer**",
      "",
      "**Teig**",
      "- 250 g Mehl",
    ]);
  });

  it("an empty heading is not renamed when the headings in the gap are as many", () => {
    const lines = ["**Für die Form:**", "Butter und Mehl", "**Teig**", "- Mehl"];
    expect(diffSection(lines, "ingredients", [group("Backteig"), item("Mehl")])).toEqual([
      "**Für die Form:**",
      "Butter und Mehl",
      "**Backteig**",
      "- Mehl",
    ]);
  });
});

describe("numbering across headings (M1 round 3)", () => {
  it("steps that continue across a heading keep one count", () => {
    const lines = ["1. a", "2. b", "### Backen", "3. c"];
    expect(diffSection(lines, "steps", [step("a"), step("neu"), step("b"), step("c")])).toEqual([
      "1. a",
      "2. neu",
      "3. b",
      "### Backen",
      "4. c",
    ]);
  });
});

describe("steps and tips are paired by position (M2 round 3)", () => {
  it("an edited step keeps its box and number style, nothing is renumbered", () => {
    expect(diffSection(["1. [x] Alter Text", "2. foo"], "steps", [step("Völlig anders"), step("foo")])).toEqual([
      "1. [x] Völlig anders",
      "2. foo",
    ]);
    expect(diffSection(["- Alpha beta", "- zwei"], "tips", [item("Gamma delta"), item("zwei")])).toEqual([
      "- Gamma delta",
      "- zwei",
    ]);
  });
});

describe("empty entries take no lines (N1 round 3)", () => {
  it("a marker alone has no hanging lines; a tip takes them from the last tip with text", () => {
    expect(listEntries(["- ", "  hang", "- a"], "tips").map((e) => e.lines)).toEqual([[0], [2]]);
    expect(listEntries(["- a", "- ", "  x"], "tips").map((e) => e.lines)).toEqual([[0, 2], [1]]);
    expect(listEntries(["- ", "  x"], "ingredients").map((e) => e.lines)).toEqual([[0]]);
  });
});

describe("one rule for the start of a line (M3 round 3)", () => {
  const starts = [
    "# a",
    "> a",
    "| a",
    "- a",
    "-- a",
    "--",
    "---",
    "+ a",
    "* a",
    "**a**",
    "= a",
    "~~~",
    "1. a",
    "2) a",
    "[ ] a",
    "[x] a",
    "![[a]]",
  ];
  it("imported text and typed text show as written after reading, in a bullet and in a step", () => {
    for (const x of starts) {
      expect(parseRecipe("", `## Zutaten\n- ${safeText(x)}\n`).ingredients[0].ingredients).toEqual([x]);
      if (x.startsWith("![[")) continue; // defuse also breaks the link brackets
      const note = parseRecipe("", `## Tipps\n- ${defuse(x)}\n## Schritte\n1. ${defuse(x)}\n`);
      expect(note.tips).toEqual([x]);
      expect(note.steps[0].text).toBe(x);
    }
  });

  it("a code fence start is never left bare", () => {
    expect(defuse("```js").startsWith("\\")).toBe(true);
    expect(defuse("---").startsWith("\\")).toBe(true);
  });
});
