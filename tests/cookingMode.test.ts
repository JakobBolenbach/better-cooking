// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { CookingMode } from "../src/ui/cookingMode";
import { setLanguage } from "../src/i18n";
import type { RecipeView, Servings } from "../src/types";

function head(servings: Servings | undefined, faktor: number, lang: "en" | "de" = "en") {
  setLanguage(lang);
  const root = document.body.appendChild(document.createElement("div"));
  const r = { title: "Pancakes", servings, ingredients: [], steps: [{ text: "Mix." }] } as unknown as RecipeView;
  render(
    h(CookingMode, {
      r,
      step: 0,
      faktor,
      onStep: () => {},
      onCloseView: () => {},
      onTimer: () => {},
      onAttempt: () => {},
      onKeepAwake: () => Promise.resolve(false),
    }),
    root,
  );
  return root.querySelector(".rz-koch-stand")!.textContent;
}

describe("cooking mode header (issue #45)", () => {
  it("says for how many servings it calculates", () => {
    expect(head({ count: 8, unit: "pieces" }, 1)).toContain("for 8 pieces");
    expect(head({ count: 8, unit: "pieces" }, 9 / 8)).toContain("for 9 pieces");
    expect(head({ count: 8, unit: "Stück" }, 9 / 8, "de")).toContain("für 9 Stück");
    expect(head({ count: 4, unit: "" }, 2)).toContain("for 8 servings");
  });
  it("says nothing when no yield is known", () => {
    expect(head(undefined, 1)).not.toContain("for ");
  });
});
