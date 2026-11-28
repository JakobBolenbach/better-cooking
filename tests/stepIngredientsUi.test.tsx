// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { CookingMode } from "../src/ui/cookingMode";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

const NOTE = `## Zutaten
- 500 g Mehl
- 400 g Wasser

## Schritte
1. Mehl und Wasser mischen.
   - Zutaten: Mehl, 285 g Wasser, Hefe
2. Ruhen lassen und Wasser bereitstellen.
3. Backen.
   - Zutaten: Wasser
`;

function show(step: number, faktor: number, note = NOTE) {
  setLanguage("de");
  const root = document.body.appendChild(document.createElement("div"));
  const r = { ...parseRecipe("x.md", note), title: "Brot" } as unknown as RecipeView;
  render(
    h(CookingMode, {
      r,
      step,
      faktor,
      onStep: () => {},
      onCloseView: () => {},
      onTimer: () => {},
      onAttempt: () => {},
      onKeepAwake: () => Promise.resolve(false),
    }),
    root,
  );
  const lines = [...root.querySelectorAll(".rz-koch-zutaten li")].map((li) => li.textContent);
  render(null, root);
  root.remove();
  return lines;
}

describe("cooking mode with explicit ingredients (ADR 0009)", () => {
  it("shows the listed lines scaled, an own amount scaled and an unknown name as written", () => {
    expect(show(0, 2)).toEqual(["1000 g Mehl", "570 g Wasser", "Hefe"]);
  });
  it("shows nothing for a step without a line, although its text names an ingredient", () => {
    expect(show(1, 1)).toEqual([]);
  });
  it("shows the list ingredient with its full amount", () => {
    expect(show(2, 1)).toEqual(["400 g Wasser"]);
  });
  it("guesses when no step has a line", () => {
    const plain = NOTE.replace(/ {3}- Zutaten: .*\n/g, "");
    expect(show(0, 1, plain)).toEqual(["500 g Mehl", "400 g Wasser"]);
  });
});
