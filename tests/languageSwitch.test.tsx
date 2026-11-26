// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App, type AppProps } from "../src/ui/App";
import { setLanguage } from "../src/i18n";
import { parseRecipe } from "../src/parse";

// jsdom has no layout.
Element.prototype.scrollIntoView = noopScroll;
function noopScroll() {}
afterEach(() => setLanguage("en"));

const text = readFileSync(resolve(process.cwd(), "tests/fixtures/sauerteig.md"), "utf8");
const noop = () => undefined;
const props = (): AppProps =>
  ({
    recipes: [{ ...parseRecipe("Recipes/Brot.md", text, 1), modified: 1, name: "Brot", cover: undefined }],
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
  }) as unknown as AppProps;

describe("language change at run time (#77)", () => {
  it("the texts change, what the user is doing stays", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    setLanguage("en");
    await act(() => render(h(App, props()), root));
    expect(root.textContent).toContain("Shopping list");
    const search = root.querySelector("input[type=search], input[type=text]") as HTMLInputElement;
    expect(search).toBeTruthy();
    await act(() => {
      search.value = "Sauer";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    setLanguage("de");
    await act(() => render(h(App, props()), root));
    expect(root.textContent).toContain("Einkaufsliste");
    expect(root.textContent).not.toContain("Shopping list");
    expect((root.querySelector("input[type=search], input[type=text]") as HTMLInputElement).value).toBe("Sauer");
  });
});
