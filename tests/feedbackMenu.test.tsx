// @vitest-environment jsdom
// The menu item "Etwas falsch? Mit Hinweis neu holen" (issue #120) is in the "⋯" menu only where it is offered.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { RecipeToolbar } from "../src/ui/recipeToolbar";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

beforeAll(() => setLanguage("de"));
afterEach(() => {
  document.body.querySelectorAll("div").forEach((el) => render(null, el));
  document.body.innerHTML = "";
});

const r = { path: "A.md", title: "A", steps: [] } as unknown as RecipeView;
async function items(feedback?: { onClick: () => void }) {
  const root = document.createElement("div");
  root.className = "rz-root";
  document.body.appendChild(root);
  const noop = () => undefined;
  await act(() =>
    render(
      h(RecipeToolbar, {
        r,
        scrolled: false,
        onBack: noop,
        onShare: noop,
        onOpenNote: noop,
        onCook: noop,
        feedback,
        menuOpen: true,
        onMenu: noop,
      }),
      root,
    ),
  );
  return [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

describe("recipe menu with feedback", () => {
  it("has the item and runs it", async () => {
    const onClick = vi.fn();
    const found = (await items({ onClick })).find((b) => b.textContent === "Etwas falsch? Mit Hinweis neu holen");
    expect(found).toBeDefined();
    found!.click();
    expect(onClick).toHaveBeenCalled();
  });
  it("does not have it where it is not offered", async () => {
    expect((await items()).map((b) => b.textContent)).not.toContain("Etwas falsch? Mit Hinweis neu holen");
  });
});
