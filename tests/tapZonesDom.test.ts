// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { CookingMode } from "../src/ui/cookingMode";
import { TAP_GHOST_MS } from "../src/tapZones";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

const recipe = {
  title: "Pancakes",
  ingredients: [{ title: "", ingredients: ["100 g Flour", "1 Egg"] }],
  steps: [{ text: "Mix." }, { text: "Rest the Flour for 10 minutes." }, { text: "Bake." }],
} as unknown as RecipeView;

function mount(over: { step?: number; tapHintSeen?: boolean } = {}) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  const onStep = vi.fn();
  const onTimer = vi.fn();
  const onTapHintSeen = vi.fn();
  void act(() => {
    render(
      h(CookingMode, {
        r: recipe,
        step: over.step ?? 1,
        faktor: 1,
        onStep,
        onCloseView: () => {},
        onTimer,
        onAttempt: () => {},
        onKeepAwake: () => Promise.resolve(false),
        tapHintSeen: over.tapHintSeen ?? true,
        onTapHintSeen,
      }),
      root,
    );
  });
  const stage = root.querySelector<HTMLElement>(".rz-koch-buehne")!;
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 700, width: 400, height: 700 }) as DOMRect;
  return { root, stage, onStep, onTimer, onTapHintSeen };
}

function pointer(
  el: Element,
  type: string,
  x: number,
  y: number,
  t: number,
  o: { pointerType?: string; isPrimary?: boolean } = {},
) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(e, {
    pointerType: { value: o.pointerType ?? "touch" },
    isPrimary: { value: o.isPrimary ?? true },
    pointerId: { value: 1 },
    timeStamp: { value: t },
  });
  void act(() => void el.dispatchEvent(e));
}

/** A press: pointer down and pointer up (the click is decided separately, see the ghost click tests). */
function tap(el: Element, x: number, y: number, o: { pointerType?: string } = {}) {
  pointer(el, "pointerdown", x, y, 100, o);
  pointer(el, "pointerup", x, y, 160, o);
}

function click(x = 300, y = 300) {
  return new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // A turn leaves a click swallower on the document for a moment; let it expire before the next test.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("tap zones in cooking mode (issue #57)", () => {
  it("goes on on the right and back on the left, and shows the pulse", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    tap(text, 300, 300);
    expect(m.onStep).toHaveBeenLastCalledWith(2);
    expect(m.root.querySelector(".rz-koch-puls.rechts")).not.toBeNull();
    tap(text, 40, 300);
    expect(m.onStep).toHaveBeenLastCalledWith(0);
    expect(m.root.querySelector(".rz-koch-puls.links")).not.toBeNull();
  });

  it("does not change the step by itself and shows no pulse at the borders", () => {
    const m = mount({ step: 0 });
    tap(m.root.querySelector(".rz-koch-schritt")!, 40, 300);
    expect(m.onStep).not.toHaveBeenCalled();
    expect(m.root.querySelector(".rz-koch-puls")).toBeNull();
  });

  it("leaves a timer chip alone", () => {
    const m = mount();
    const chip = m.root.querySelector(".rz-zeit")!;
    tap(chip, 300, 300);
    void act(() => void chip.dispatchEvent(click()));
    expect(m.onStep).not.toHaveBeenCalled();
    expect(m.onTimer).toHaveBeenCalledTimes(1);
  });

  it("ignores a mouse", () => {
    const m = mount();
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300, { pointerType: "mouse" });
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("does not turn the page while text is selected", () => {
    const m = mount();
    vi.spyOn(document, "getSelection").mockReturnValue({ toString: () => "Rest" } as Selection);
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("ignores a second finger", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointerdown", 320, 300, 110, { isPrimary: false });
    pointer(text, "pointerup", 300, 300, 160);
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("counts a tap at the very edge", () => {
    const m = mount();
    tap(m.root.querySelector(".rz-koch-schritt")!, 2, 300);
    expect(m.onStep).toHaveBeenLastCalledWith(0);
    tap(m.root.querySelector(".rz-koch-schritt")!, 399, 300);
    expect(m.onStep).toHaveBeenLastCalledWith(2);
  });

  it("counts a tap beside a full-width ingredient box, not on the controls inside", () => {
    const m = mount();
    const box = m.root.querySelector<HTMLElement>(".rz-koch-zutaten")!;
    box.getBoundingClientRect = () =>
      ({ left: 0, top: 200, right: 400, bottom: 400, width: 400, height: 200 }) as DOMRect;
    tap(box, 390, 300);
    expect(m.onStep).toHaveBeenLastCalledWith(2);
  });

  it("ignores a tap right after a scroll", () => {
    const m = mount();
    const e = new Event("scroll");
    Object.defineProperty(e, "timeStamp", { value: 50 });
    void act(() => void m.stage.dispatchEvent(e));
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("swallows the one click after a turn, not a later one", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    const seen = vi.fn();
    m.root.addEventListener("click", seen);
    tap(text, 300, 300);
    const first = click();
    void act(() => void text.dispatchEvent(first));
    expect(first.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    const second = click();
    void act(() => void text.dispatchEvent(second));
    expect(second.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("stops waiting for the ghost click after a short time", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    tap(text, 300, 300);
    vi.advanceTimersByTime(TAP_GHOST_MS + 1);
    const late = click();
    void act(() => void text.dispatchEvent(late));
    expect(late.defaultPrevented).toBe(false);
  });

  it("does not swallow a click when the step did not change", () => {
    const m = mount({ step: 0 });
    const text = m.root.querySelector(".rz-koch-schritt")!;
    tap(text, 40, 300);
    const c = click();
    void act(() => void text.dispatchEvent(c));
    expect(c.defaultPrevented).toBe(false);
  });

  it("does not turn after pointercancel, a drag or a vertical move", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointercancel", 0, 0, 120);
    pointer(text, "pointerup", 300, 300, 130);
    expect(m.onStep).not.toHaveBeenCalled();
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointerup", 270, 300, 160);
    expect(m.onStep).not.toHaveBeenCalled();
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointerup", 300, 500, 160);
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("does not swipe: a long sideways move changes nothing", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointermove", 200, 305, 140);
    pointer(text, "pointerup", 200, 305, 160);
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("announces the step politely", () => {
    const m = mount();
    expect(m.root.querySelector(".rz-koch-stand [aria-live=polite]")?.textContent).toBe("Step 2 of 3");
  });
});

describe("hint (issue #57)", () => {
  it("shows once and reports it", () => {
    const m = mount({ tapHintSeen: false });
    expect(m.onTapHintSeen).toHaveBeenCalledTimes(1);
    expect(m.root.querySelector(".rz-koch-tipp")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays away once it was seen", () => {
    const m = mount({ tapHintSeen: true });
    expect(m.onTapHintSeen).not.toHaveBeenCalled();
    expect(m.root.querySelector(".rz-koch-tipp")).toBeNull();
  });
});
