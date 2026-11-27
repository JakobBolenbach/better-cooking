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
    root.className = "rz-root";
    document.body.appendChild(root);
    const page = document.createElement("button");
    root.appendChild(page);
    const onPage = vi.fn();
    page.addEventListener("click", onPage);
    const onOpen = vi.fn();
    const run = vi.fn();
    await act(() =>
      render(h(RecipeMenu, { open: true, items: [{ id: "a", label: "A", icon: "notiz", run }], onOpen }), root),
    );
    page.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    page.dispatchEvent(new Event("pointerup", { bubbles: true, cancelable: true }));
    page.click();
    expect(onOpen).toHaveBeenCalledWith(false);
    expect(onPage).not.toHaveBeenCalled();
    // later clicks are normal again
    await new Promise((r) => setTimeout(r, 5));
    page.click();
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it("a press outside the view only closes the menu: nothing is swallowed, the focus is not taken back", async () => {
    const view = document.createElement("div");
    view.className = "rz-root";
    document.body.appendChild(view);
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    const onElsewhere = vi.fn();
    elsewhere.addEventListener("click", onElsewhere);
    const onOpen = vi.fn();
    await act(() =>
      render(
        h(RecipeMenu, { open: true, items: [{ id: "a", label: "A", icon: "notiz", run: vi.fn() }], onOpen }),
        view,
      ),
    );
    elsewhere.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    elsewhere.click();
    expect(onOpen).toHaveBeenCalledWith(false);
    expect(onElsewhere).toHaveBeenCalledTimes(1);
    await act(() => render(h(RecipeMenu, { open: false, items: [], onOpen }), view));
    expect(document.activeElement).not.toBe(view.querySelector("button"));
  });

  it("closes when the window loses focus, the tab is hidden or the focus moves out of the view", async () => {
    for (const leave of [
      () => window.dispatchEvent(new Event("blur")),
      () => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      },
      () => {
        const other = document.createElement("input");
        document.body.appendChild(other);
        other.focus();
      },
    ]) {
      const view = document.createElement("div");
      view.className = "rz-root";
      document.body.appendChild(view);
      const onOpen = vi.fn();
      await act(() =>
        render(
          h(RecipeMenu, { open: true, items: [{ id: "a", label: "A", icon: "notiz", run: vi.fn() }], onOpen }),
          view,
        ),
      );
      leave();
      expect(onOpen).toHaveBeenCalledWith(false);
      await act(() => render(null, view));
    }
  });

  it("swallows only the click of the same press, not a later one", async () => {
    const view = document.createElement("div");
    view.className = "rz-root";
    document.body.appendChild(view);
    const inside = document.createElement("button");
    view.appendChild(inside);
    const onInside = vi.fn();
    inside.addEventListener("click", onInside);
    const wrapper = document.createElement("div");
    view.appendChild(wrapper);
    await act(() =>
      render(
        h(RecipeMenu, { open: true, items: [{ id: "a", label: "A", icon: "notiz", run: vi.fn() }], onOpen: vi.fn() }),
        wrapper,
      ),
    );
    const press = (type: string, id: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { pointerId: id });
      inside.dispatchEvent(e);
    };
    press("pointerdown", 7);
    press("pointerup", 9); // another pointer: does not end this press
    press("pointerup", 7);
    inside.click();
    expect(onInside).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 5));
    inside.click();
    expect(onInside).toHaveBeenCalledTimes(1);
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
