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
  const text = root.querySelector(".rz-koch-stand")!.textContent;
  // Unmount, so effects clear their timers before the test environment is torn down.
  render(null, root);
  root.remove();
  return text;
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

describe("resume hint (issue #114)", () => {
  function hint(over: { resumed?: boolean; step?: number; onStartOver?: () => void }) {
    setLanguage("en");
    const root = document.body.appendChild(document.createElement("div"));
    const r = {
      title: "Pancakes",
      ingredients: [],
      steps: [{ text: "Mix." }, { text: "Fry." }, { text: "Serve." }],
    } as unknown as RecipeView;
    render(
      h(CookingMode, {
        r,
        step: over.step ?? 2,
        faktor: 1,
        onStep: () => {},
        onCloseView: () => {},
        onTimer: () => {},
        onAttempt: () => {},
        onKeepAwake: () => Promise.resolve(false),
        resumed: over.resumed,
        onStartOver: over.onStartOver,
        touch: false,
      }),
      root,
    );
    const el = root.querySelector<HTMLElement>(".rz-koch-weiter");
    const out = { text: el?.textContent ?? null, button: el?.querySelector("button") ?? null };
    return { ...out, done: () => (render(null, root), root.remove()) };
  }
  it("says where it continued and offers the first step", () => {
    let started = 0;
    const m = hint({ resumed: true, onStartOver: () => started++ });
    expect(m.text).toBe("Continued at step 3.Start over");
    m.button!.click();
    expect(started).toBe(1);
    m.done();
  });
  it("is not there when cooking mode started at the first step", () => {
    const m = hint({ resumed: false });
    expect(m.text).toBeNull();
    m.done();
  });
});
