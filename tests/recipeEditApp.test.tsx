// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App, type AppProps } from "../src/ui/App";
import type { EditApi } from "../src/ui/editApi";
import { setLanguage } from "../src/i18n";
import { FIELD_PRESETS } from "../src/noteFormat";
import { draftOfText } from "../src/recipeEdit";
import { parseRecipe } from "../src/parse";
import type { RecipeView } from "../src/types";

Element.prototype.scrollIntoView = () => undefined;
afterEach(() => {
  setLanguage("en");
  document.body.innerHTML = "";
});

const text = readFileSync(resolve(process.cwd(), "tests/fixtures/sauerteig.md"), "utf8");
const noop = () => undefined;
const recipe = (): RecipeView => ({ ...parseRecipe("Recipes/Brot.md", text, 1), imageSrcs: [] });
const forgotten: string[] = [];
const hints: string[] = [];
const props = (over: Partial<AppProps>): AppProps =>
  ({
    recipes: [recipe()],
    theme: "hell",
    mode: "hell",
    jobs: [],
    processor: null,
    shopping: "",
    plan: "",
    onShoppingEdit: () => Promise.resolve(false),
    onPlanEdit: () => Promise.resolve(false),
    onPlan: noop,
    onPlanShopping: noop,
    onPlanExport: noop,
    onOpenShoppingNote: noop,
    onOpenPlanNote: noop,
    onList: noop,
    onMode: noop,
    onOpenNote: noop,
    onStatus: noop,
    onRating: noop,
    onMade: noop,
    onUndoMade: noop,
    onAttempt: () => Promise.resolve(true),
    onShop: noop,
    onImport: () => Promise.resolve({ ok: true }),
    onJobGone: noop,
    onRetry: () => Promise.resolve({ ok: true }),
    onHint: (t: string) => void hints.push(t),
    onKeepAwake: () => Promise.resolve(false),
    resume: { startStep: () => 0, note: noop, forget: (p: string) => void forgotten.push(p) },
    timers: {
      get: () => [],
      subscribe: () => noop,
      start: noop,
      pause: noop,
      resume: noop,
      addMinute: noop,
      stop: noop,
    },
    start: { recipe: "Recipes/Brot.md" },
    ...over,
  }) as unknown as AppProps;

const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const dialog = (root: HTMLElement) => root.querySelector('[role="dialog"]');

async function openEditor(save: EditApi["save"]) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const api: EditApi = { open: () => Promise.resolve({ ok: true, base: draftOfText(text, FIELD_PRESETS.de) }), save };
  await act(() => render(h(App, props({ edit: api })), root));
  await act(() => (root.querySelector('button[aria-label="More actions"]') as HTMLElement).click());
  const first = root.querySelector('[role="menuitem"]') as HTMLElement;
  expect(first.textContent).toBe("Edit");
  await act(() => first.click());
  await tick();
  return root;
}

const title = (root: HTMLElement) => root.querySelector<HTMLInputElement>('.rz-fenster input[type="text"]')!;

describe("the recipe editor in the app", () => {
  it("is the first entry of the menu, and not offered without a host that can write", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    await act(() => render(h(App, props({})), root));
    await act(() => (root.querySelector('button[aria-label="More actions"]') as HTMLElement).click());
    expect(root.querySelector('[role="menuitem"]')!.textContent).not.toBe("Edit");
  });

  it("Esc with unsaved changes asks first; a page change waits for it", async () => {
    const root = await openEditor(() => Promise.resolve({ ok: true, parts: [] }));
    expect(dialog(root)).toBeTruthy();
    const input = title(root);
    input.value = "Anderer Titel";
    await act(() => void input.dispatchEvent(new Event("input", { bubbles: true })));
    const esc = () =>
      act(
        () =>
          void root
            .querySelector(".rz-fenster")!
            .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
    await esc();
    expect(dialog(root)).toBeTruthy();
    expect(root.textContent).toContain("Discard your changes?");
    hints.length = 0;
    const shopping = [...root.querySelectorAll<HTMLElement>("button")].find(
      (b) => /^Shopping list/.test(b.textContent ?? "") && !b.closest(".rz-fenster"),
    );
    expect(shopping).toBeTruthy();
    await act(() => shopping!.click());
    expect(hints).toEqual(["Close the open dialog first."]);
    expect(dialog(root)).toBeTruthy();
    const discard = [...root.querySelectorAll("button")].find((b) => b.textContent === "Discard")!;
    await act(() => discard.click());
    expect(dialog(root)).toBeNull();
  });

  it("a saved edit that changed the number of steps makes cooking mode forget its position", async () => {
    forgotten.length = 0;
    const save = vi.fn(() => Promise.resolve({ ok: true as const, parts: ["steps" as const] }));
    const root = await openEditor(save);
    const del = root.querySelector<HTMLButtonElement>('button[aria-label^="Delete step: Step 1"]')!;
    await act(() => del.click());
    const saveButton = [...root.querySelectorAll<HTMLButtonElement>(".rz-fenster-fuss button")].find(
      (b) => b.textContent === "Save",
    )!;
    await act(() => saveButton.click());
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    expect(forgotten).toEqual(["Recipes/Brot.md"]);
    expect(dialog(root)).toBeNull();
  });

  it("a saved edit that only reorders the steps makes cooking mode forget its position", async () => {
    forgotten.length = 0;
    const root = await openEditor(() => Promise.resolve({ ok: true, parts: ["steps" as const] }));
    await act(() => root.querySelector<HTMLButtonElement>('button[aria-label^="Move down: Step 1"]')!.click());
    const saveButton = [...root.querySelectorAll<HTMLButtonElement>(".rz-fenster-fuss button")].find(
      (b) => b.textContent === "Save",
    )!;
    await act(() => saveButton.click());
    await tick();
    expect(forgotten).toEqual(["Recipes/Brot.md"]);
  });

  it("a saved edit that keeps the steps leaves the cooking position", async () => {
    forgotten.length = 0;
    const root = await openEditor(() => Promise.resolve({ ok: true, parts: ["title"] }));
    const input = title(root);
    input.value = "Neuer Titel";
    await act(() => void input.dispatchEvent(new Event("input", { bubbles: true })));
    const saveButton = [...root.querySelectorAll<HTMLButtonElement>(".rz-fenster-fuss button")].find(
      (b) => b.textContent === "Save",
    )!;
    await act(() => saveButton.click());
    await tick();
    expect(forgotten).toEqual([]);
    expect(dialog(root)).toBeNull();
  });
});
