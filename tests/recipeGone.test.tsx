// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App, type AppProps } from "../src/ui/App";
import { setLanguage } from "../src/i18n";
import { parseRecipe } from "../src/parse";
import type { RecipeView } from "../src/types";

Element.prototype.scrollIntoView = () => undefined;
afterEach(() => setLanguage("en"));

const text = readFileSync(resolve(process.cwd(), "tests/fixtures/sauerteig.md"), "utf8");
const noop = () => undefined;
const recipe = (): RecipeView => ({ ...parseRecipe("Recipes/Brot.md", text, 1), imageSrcs: [] });
const forgotten: string[] = [];
const props = (recipes: RecipeView[], over: Partial<AppProps> = {}): AppProps =>
  ({
    recipes,
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
    onHint: noop,
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
    ...over,
  }) as unknown as AppProps;

const open = (root: HTMLElement) => root.querySelector(".rz-detail-ebene")!.classList.contains("offen");

describe("a recipe that is deleted while its page and dialog are open (#119)", () => {
  it("closes both, and a new note under the same path does not bring them back", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const api = {
      preview: () => new Promise<never>(() => undefined),
      run: () => Promise.resolve({ ok: true }),
    };
    await act(() =>
      render(h(App, props([recipe()], { deleteRecipe: api, start: { recipe: "Recipes/Brot.md" } })), root),
    );
    expect(open(root)).toBe(true);
    await act(() => (root.querySelector('button[aria-label="More actions"]') as HTMLElement).click());
    await act(() => ([...root.querySelectorAll('[role="menuitem"]')].at(-1) as HTMLElement).click());
    expect(root.querySelector('[role="dialog"]')).toBeTruthy();
    // The delete event reloads the list without the recipe: page and dialog go.
    await act(() => render(h(App, props([], { deleteRecipe: api })), root));
    expect(open(root)).toBe(false);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    // A new note with the same name arrives (sync, undo): it is not opened again.
    await act(() => render(h(App, props([recipe()], { deleteRecipe: api })), root));
    expect(open(root)).toBe(false);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it("goes back to the overview and forgets the cooking position when the delete is confirmed", async () => {
    forgotten.length = 0;
    const root = document.createElement("div");
    document.body.appendChild(root);
    const shown = { files: [], targets: [] };
    const api = {
      preview: () =>
        Promise.resolve({
          ok: true as const,
          title: "Brot",
          images: [],
          imagesKept: false,
          backups: 0,
          translations: [],
          plan: [],
          shown,
        }),
      run: () => Promise.resolve({ ok: true }),
    };
    await act(() =>
      render(h(App, props([recipe()], { deleteRecipe: api, start: { recipe: "Recipes/Brot.md" } })), root),
    );
    await act(() => (root.querySelector('button[aria-label="More actions"]') as HTMLElement).click());
    await act(() => ([...root.querySelectorAll('[role="menuitem"]')].at(-1) as HTMLElement).click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    const go = root.querySelector(".rz-knopf-gefahr") as HTMLButtonElement;
    expect(go.disabled).toBe(false);
    await act(() => go.click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(open(root)).toBe(false);
    expect(forgotten).toEqual(["Recipes/Brot.md"]);
  });

  it("disables the button while the box was switched and a new preview is read", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    let answer: (v: unknown) => void = noop;
    let calls = 0;
    const base = {
      ok: true as const,
      title: "Brot",
      images: [],
      imagesKept: false,
      backups: 0,
      translations: [{ path: "Recipes/Bread.md", title: "Bread" }],
      plan: [],
      shown: { files: [], targets: [] },
    };
    const api = {
      preview: () => (++calls === 1 ? Promise.resolve(base) : new Promise((r) => (answer = r))),
      run: () => Promise.resolve({ ok: true }),
    } as never;
    await act(() =>
      render(h(App, props([recipe()], { deleteRecipe: api, start: { recipe: "Recipes/Brot.md" } })), root),
    );
    await act(() => (root.querySelector('button[aria-label="More actions"]') as HTMLElement).click());
    await act(() => ([...root.querySelectorAll('[role="menuitem"]')].at(-1) as HTMLElement).click());
    await act(() => new Promise((r) => setTimeout(r, 0)));
    const go = () => root.querySelector(".rz-knopf-gefahr") as HTMLButtonElement;
    expect(go().disabled).toBe(false);
    await act(() => (root.querySelector(".rz-loeschen-wahl input") as HTMLElement).click());
    expect(go().disabled).toBe(true);
    expect(go().textContent).toBe("Reading …");
    await act(async () => {
      answer(base);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(go().disabled).toBe(false);
  });
});
