import { beforeEach, describe, expect, it } from "vitest";
import { formatQuantity, scaleLine, splitQuantity } from "../src/quantities";
import { durationText, findTimes } from "../src/cooking";
import { addToList, itemFromLine } from "../src/shopping";
import { setLanguage } from "../src/i18n";

beforeEach(() => setLanguage("en"));
const text = (parts: { text: string }[]) => parts.map((t) => t.text).join("");

describe("English recipes", () => {
  it("finds durations as timers", () => {
    const t = findTimes("Bake for 25 minutes, rest 1 hour, simmer 10 to 15 mins and stir for 30 seconds.");
    expect(t.map((x) => [x.text, x.seconds, x.untilSeconds])).toEqual([
      ["25 minutes", 1500, undefined],
      ["1 hour", 3600, undefined],
      ["10 to 15 mins", 600, 900],
      ["30 seconds", 30, undefined],
    ]);
    expect(findTimes("about 2 hrs").map((x) => x.seconds)).toEqual([7200]);
  });

  it("names durations in the interface language", () => {
    expect(durationText(45)).toBe("45 s");
    expect(durationText(600)).toBe("10 min");
    expect(durationText(5400)).toBe("1 h 30 min");
    setLanguage("de");
    expect(durationText(5400)).toBe("1 Std. 30 Min.");
  });

  it("knows cups, spoons, ounces and pounds", () => {
    expect(splitQuantity("1 ½ cups flour")).toEqual({ amount: 1.5, unit: "cups", rest: "flour" });
    expect(splitQuantity("2 tbsp olive oil")).toEqual({ amount: 2, unit: "tbsp", rest: "olive oil" });
    expect(text(scaleLine("¾ cup sugar", 2))).toBe("1 ½ cup sugar");
    expect(text(scaleLine("2 to 3 cloves garlic", 2))).toBe("4 to 6 cloves garlic");
    expect(formatQuantity(1.5, "cups")).toBe("1 ½");
  });

  it("merges English units on the shopping list", () => {
    const out = addToList(
      "- [ ] 1 cup milk\n- [ ] 8 oz pasta\n",
      [itemFromLine("½ cup milk", "A"), itemFromLine("1 lb pasta", "B"), itemFromLine("2 tbsp butter", "C")],
      "x",
    );
    expect(out).toBe("- [ ] 1 ½ cup milk · A\n- [ ] 24 oz pasta · B\n- [ ] 2 tbsp butter · C\n");
  });
});
