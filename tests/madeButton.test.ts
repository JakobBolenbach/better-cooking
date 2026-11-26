// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { MadeButton, UNDO_MS } from "../src/ui/madeButton";
import { setLanguage } from "../src/i18n";
import { todayIso } from "../src/parse";

function mount(lastMade: string | undefined) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  const onMade = vi.fn();
  const draw = (last: string | undefined) => render(h(MadeButton, { path: "a.md", lastMade: last, onMade }), root);
  draw(lastMade);
  const button = () => root.querySelector("button")!;
  return { root, onMade, draw, button, text: () => button().textContent };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("MadeButton (issue #45)", () => {
  it("is an action 'Made today' with the last date as second text", () => {
    const m = mount("2026-11-20");
    expect(m.text()).toBe("Made today" + "last: 20 Nov 2026");
    expect(m.button().querySelector("small")!.textContent).toBe("last: 20 Nov 2026");
  });

  it("has no second text without a last date and is disabled once it was made today", () => {
    const m = mount(undefined);
    expect(m.text()).toBe("Made today");
    expect(m.button().querySelector("small")).toBeNull();
    m.draw(todayIso());
    expect(m.button().disabled).toBe(true);
  });

  it("offers Undo after a click, which restores the previous date", async () => {
    const m = mount("2026-11-20");
    m.button().click();
    expect(m.onMade).toHaveBeenLastCalledWith(todayIso());
    m.draw(todayIso()); // the note was re-read with the new date
    await act(() => {});
    expect(m.button().textContent).toContain("Undo");
    expect(m.button().disabled).toBe(false);
    m.button().click();
    expect(m.onMade).toHaveBeenLastCalledWith("2026-11-20");
    await act(() => {});
    expect(m.text()).toContain("Made today");
  });

  it("removes the date again when there was none before", async () => {
    const m = mount(undefined);
    m.button().click();
    m.draw(todayIso());
    await act(() => {});
    m.button().click();
    expect(m.onMade).toHaveBeenLastCalledWith(null);
  });

  it("takes the Undo offer back after a while", async () => {
    vi.useFakeTimers();
    const m = mount("2026-11-20");
    await act(() => {
      m.button().click();
    });
    m.draw(todayIso());
    await act(() => {});
    expect(m.button().textContent).toContain("Undo");
    await act(() => {
      vi.advanceTimersByTime(UNDO_MS + 10);
    });
    expect(m.button().textContent).not.toContain("Undo");
    expect(m.button().disabled).toBe(true);
  });
});
