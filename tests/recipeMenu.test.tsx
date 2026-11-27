// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { RecipeMenu } from "../src/ui/recipeMenu";

afterEach(() => {
  // unmounts the menus so their document listeners go
  document.querySelectorAll("body > div").forEach((el) => render(null, el));
  document.body.innerHTML = "";
});

describe("recipe menu", () => {
  it("a press outside closes it and the click that follows does not reach the page", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const page = document.createElement("button");
    document.body.appendChild(page);
    const onPage = vi.fn();
    page.addEventListener("click", onPage);
    const onOpen = vi.fn();
    const run = vi.fn();
    await act(() =>
      render(h(RecipeMenu, { open: true, items: [{ id: "a", label: "A", icon: "notiz", run }], onOpen }), root),
    );
    page.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    page.click();
    expect(onOpen).toHaveBeenCalledWith(false);
    expect(onPage).not.toHaveBeenCalled();
    // later clicks are normal again
    page.click();
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it("a press inside is left alone, a choice closes the menu and runs the action", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const onOpen = vi.fn();
    const run = vi.fn();
    await act(() =>
      render(h(RecipeMenu, { open: true, items: [{ id: "a", label: "A", icon: "notiz", run }], onOpen }), root),
    );
    const item = root.querySelector('[role="menuitem"]') as HTMLElement;
    item.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    expect(onOpen).not.toHaveBeenCalled();
    item.click();
    expect(onOpen).toHaveBeenCalledWith(false);
    expect(run).toHaveBeenCalled();
  });
});
