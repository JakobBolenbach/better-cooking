import { describe, expect, it } from "vitest";
import { cleanTitle, diffSection, safeText, unescapeLead, type Want } from "../src/sectionDiff";

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
    expect(diffSection(lines, "tips", [item("a"), item("x"), item("c")])).toEqual(["- a", "  note of a", "- x", "- c"]);
    expect(diffSection(lines, "tips", [item("b"), item("c")])).toEqual(["- b", "- c"]);
  });

  it("a changed item becomes one rendered line; a changed ingredient keeps the lines hanging below it", () => {
    expect(diffSection(["- [ ] 2 Eier", "  Größe M", "- Salz"], "ingredients", [item("3 Eier"), item("Salz")])).toEqual(
      ["- 3 Eier", "  Größe M", "- Salz"],
    );
    expect(diffSection(["- Tipp eins", "  und weiter", "- zwei"], "tips", [item("Tipp 1"), item("zwei")])).toEqual([
      "- Tipp 1",
      "- zwei",
    ]);
  });

  it("a moved item keeps its raw lines", () => {
    const lines = ["- [x] a", "  hang", "- b", "- c"];
    expect(diffSection(lines, "tips", [item("b"), item("c"), item("a")])).toEqual(["- b", "- c", "- [x] a", "  hang"]);
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
      "**Hefeteig**",
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
    expect(safeText("2 EL **Öl** und -5 °C")).toBe("2 EL **Öl** und -5 °C");
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
