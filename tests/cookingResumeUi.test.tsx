// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { CookingMode } from "../src/ui/cookingMode";
import { useCookingResume } from "../src/ui/useCookingResume";
import { createResume, type ResumeApi } from "../src/cookingResume";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

const recipe = {
  path: "R/Soup.md",
  title: "Soup",
  ingredients: [],
  steps: [{ text: "Chop." }, { text: "Cook." }, { text: "Blend." }, { text: "Serve." }],
} as unknown as RecipeView;

/** A device: storage in memory, a log of what the UI noted. */
function device() {
  let stored: unknown;
  const inner = createResume({
    now: () => 1_000_000,
    load: () => stored,
    save: (v) => (stored = JSON.parse(JSON.stringify(v)) as unknown),
  });
  const notes: [string, number, number][] = [];
  const api: ResumeApi = {
    startStep: inner.startStep,
    note: (path, step, count) => {
      notes.push([path, step, count]);
      inner.note(path, step, count);
    },
  };
  return { api, notes };
}

let ctl: ReturnType<typeof useCookingResume>;
function Harness(p: { resume: ResumeApi }) {
  ctl = useCookingResume({ resume: p.resume, recipes: [recipe] });
  const { cooking } = ctl;
  return cooking ? (
    <CookingMode
      r={recipe}
      step={cooking.step}
      faktor={1}
      resumed={cooking.resumed}
      onStep={ctl.stepTo}
      onCloseView={() => ctl.setCooking(null)}
      onTimer={() => {}}
      onAttempt={() => {}}
      onKeepAwake={() => Promise.resolve(false)}
      tapHintSeen
    />
  ) : null;
}

const roots: HTMLElement[] = [];
function mount(resume: ResumeApi) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  roots.push(root);
  void act(() => render(<Harness resume={resume} />, root));
  return root;
}
afterEach(() => {
  for (const r of roots.splice(0)) {
    render(null, r);
    r.remove();
  }
});

const press = (root: HTMLElement, sel: string) => void act(() => root.querySelector<HTMLElement>(sel)!.click());
const next = (root: HTMLElement) => press(root, ".rz-knopf-haupt");
const hint = (root: HTMLElement) => root.querySelector(".rz-koch-weiter:not(.verborgen)");

describe("cooking mode remembers its step (issue #114)", () => {
  it("notes real step changes, closes, and continues there with the hint until the next step", () => {
    const d = device();
    const root = mount(d.api);
    void act(() => ctl.startCooking(recipe.path));
    expect(d.notes).toEqual([]); // opening writes nothing
    next(root);
    next(root);
    next(root);
    expect(d.notes).toEqual([
      [recipe.path, 1, 4],
      [recipe.path, 2, 4],
      [recipe.path, 3, 4],
    ]);
    press(root, 'button[aria-label="Exit cooking mode"]');
    expect(root.querySelector(".rz-koch")).toBeNull();

    void act(() => ctl.startCooking(recipe.path));
    expect(root.querySelector(".rz-koch-nr")!.textContent).toBe("4");
    expect(hint(root)!.textContent).toContain("Continuing at step 4.");
    expect(d.notes).toHaveLength(3); // continuing is no change either
    next(root); // the done view
    expect(hint(root)).toBeNull();
    expect(d.notes.at(-1)).toEqual([recipe.path, 4, 4]);

    press(root, ".rz-knopf:not(.rz-knopf-haupt):not(.rz-knopf-gross)"); // "Close" in the done view
    void act(() => ctl.startCooking(recipe.path));
    expect(root.querySelector(".rz-koch-nr")!.textContent).toBe("1"); // finished: forgotten
    expect(hint(root)).toBeNull();
  });

  it("Start over goes to step 1, keeps the focus and the place of the hint", () => {
    const d = device();
    const root = mount(d.api);
    void act(() => ctl.startCooking(recipe.path));
    next(root);
    next(root);
    press(root, 'button[aria-label="Exit cooking mode"]');
    void act(() => ctl.startCooking(recipe.path));
    const start = root.querySelector<HTMLElement>(".rz-koch-weiter button")!;
    void act(() => start.focus());
    expect(document.activeElement).toBe(start);
    void act(() => start.click());
    expect(root.querySelector(".rz-koch-nr")!.textContent).toBe("1");
    expect(hint(root)).toBeNull();
    // the node stays (hidden): no jump of the layout; the focus is in cooking mode, not on the page
    expect(root.querySelector(".rz-koch-weiter.verborgen")).not.toBeNull();
    expect(document.activeElement).toBe(root.querySelector(".rz-koch"));
  });

  it("keeps the focus in cooking mode when Next disappears in the done view", () => {
    const root = mount(device().api);
    void act(() => ctl.startCooking(recipe.path));
    const button = () => root.querySelector<HTMLElement>(".rz-knopf-haupt")!;
    for (let i = 0; i < 3; i++) next(root);
    void act(() => button().focus());
    next(root);
    expect(root.querySelector(".rz-koch-fertig")).not.toBeNull();
    expect(document.activeElement).toBe(root.querySelector(".rz-koch"));
  });
});
