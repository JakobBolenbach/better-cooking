// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { DOUBLE_CLICK_MS, MadeButton, UNDO_MS } from "../src/ui/madeButton";
import { setLanguage } from "../src/i18n";
import { todayIso } from "../src/parse";

function mount(lastMade: string | undefined) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  const onMade = vi.fn();
  const onUndo = vi.fn();
  const draw = (last: string | undefined) => render(h(MadeButton, { lastMade: last, onMade, onUndo }), root);
  draw(lastMade);
  const button = () => root.querySelector("button")!;
  return { onMade, onUndo, draw, button, text: () => button().textContent };
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

  it("offers Undo after a click, which calls onUndo once", async () => {
    vi.useFakeTimers();
    const m = mount("2026-11-20");
    await act(() => {
      m.button().click();
    });
    expect(m.onMade).toHaveBeenCalledTimes(1);
    m.draw(todayIso()); // the note was re-read with the new date
    await act(() => {});
    expect(m.button().textContent).toContain("Undo");
    expect(m.button().disabled).toBe(false);
    await act(() => {
      vi.advanceTimersByTime(DOUBLE_CLICK_MS + 50);
    });
    await act(() => {
      m.button().click();
    });
    expect(m.onUndo).toHaveBeenCalledTimes(1);
    expect(m.text()).toContain("Made today");
    expect(m.text()).not.toContain("Undo");
  });

  it("ignores a second click right after the first (double click)", async () => {
    vi.useFakeTimers();
    const m = mount("2026-11-20");
    await act(() => {
      m.button().click();
    });
    await act(() => {
      vi.advanceTimersByTime(100);
    });
    await act(() => {
      m.button().click();
    });
    expect(m.onUndo).not.toHaveBeenCalled();
    expect(m.button().textContent).toContain("Undo");
  });

  it("takes the Undo offer back after a while", async () => {
    vi.useFakeTimers();
    const m = mount("2026-11-20");
    await act(() => {
      m.button().click();
    });
    m.draw(todayIso());
    await act(() => {
      vi.advanceTimersByTime(UNDO_MS + 10);
    });
    expect(m.button().textContent).not.toContain("Undo");
    expect(m.button().disabled).toBe(true);
  });
});
