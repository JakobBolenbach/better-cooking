// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { ServingsControl } from "../src/ui/recipePage";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

const recipe = { servings: { count: 4, unit: "servings" } } as RecipeView;

function buttons(serving: number) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  render(h(ServingsControl, { r: recipe, faktor: 1, serving, onServing: () => {} }), root);
  return Array.from(root.querySelectorAll("button")).map((b) => ({
    label: b.getAttribute("aria-label"),
    disabled: b.disabled,
  }));
}

describe("ServingsControl", () => {
  it("renders the same buttons in the same order at the original and a changed amount (issue #42)", () => {
    const atBase = buttons(4);
    const changed = buttons(5);
    expect(atBase).toHaveLength(3);
    expect(changed.map((b) => b.label)).toEqual(atBase.map((b) => b.label));
  });

  it("disables only the 'original amount' button, and only at the original amount", () => {
    const atBase = buttons(4);
    const changed = buttons(5);
    expect(atBase.filter((b) => b.disabled).map((b) => b.label)).toEqual(["Original amount"]);
    expect(changed.some((b) => b.disabled)).toBe(false);
  });
});
