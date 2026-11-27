// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { CookingMode } from "../src/ui/cookingMode";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

const recipe = {
  title: "Pancakes",
  ingredients: [{ title: "", ingredients: ["100 g Flour", "1 Egg"] }],
  steps: [{ text: "Mix." }, { text: "Rest the Flour for 10 minutes." }, { text: "Bake." }],
} as unknown as RecipeView;

function mount(over: { step?: number; tapHintSeen?: boolean; touch?: boolean } = {}) {
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
        touch: over.touch ?? true,
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

// jsdom marks every event as untrusted; the hook asks src/ui/trusted.ts, which stands in here.
const trustedEvents = new WeakSet<Event>();
vi.mock("../src/ui/trusted", () => ({ isTrusted: (e: Event) => trustedEvents.has(e) }));

/** A click as a finger makes it: trusted, with a press count, at a time (same time base as the pointer events). */
function click(x = 300, y = 300, o: { detail?: number; t?: number; trusted?: boolean } = {}) {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: o.detail ?? 1 });
  Object.defineProperty(e, "timeStamp", { value: o.t ?? 170 });
  if (o.trusted !== false) trustedEvents.add(e);
  return e;
}

function fire(el: Element, e: Event) {
  void act(() => void el.dispatchEvent(e));
  return e;
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

  it("counts a tap beside a full-width ingredient box and on its (static) rows", () => {
    const m = mount();
    const box = m.root.querySelector<HTMLElement>(".rz-koch-zutaten")!;
    box.getBoundingClientRect = () =>
      ({ left: 0, top: 200, right: 400, bottom: 400, width: 400, height: 200 }) as DOMRect;
    tap(box, 390, 300);
    expect(m.onStep).toHaveBeenLastCalledWith(2);
    // The rows are plain text in cooking mode (no tick button), so a tap on one turns the step too.
    const row = box.querySelector(".rz-zutat")!;
    expect(row.tagName).toBe("SPAN");
    m.onStep.mockClear();
    tap(row, 200, 300);
    expect(m.onStep).toHaveBeenCalledTimes(1);
  });

  it("ignores a tap right after a scroll", () => {
    const m = mount();
    const e = new Event("scroll");
    Object.defineProperty(e, "timeStamp", { value: 50 });
    void act(() => void m.stage.dispatchEvent(e));
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    expect(m.onStep).not.toHaveBeenCalled();
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

/** Cooking mode with its own step state, as in the app, so a turn really swaps the view. */
function mountWithState(startStep: number) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  const onAttempt = vi.fn();
  function Host() {
    const [step, setStep] = useState(startStep);
    return h(CookingMode, {
      r: recipe,
      step,
      faktor: 1,
      onStep: setStep,
      onCloseView: () => {},
      onTimer: () => {},
      onAttempt,
      onKeepAwake: () => Promise.resolve(false),
      tapHintSeen: true,
      onTapHintSeen: () => {},
    });
  }
  void act(() => void render(h(Host, {}), root));
  const stage = root.querySelector<HTMLElement>(".rz-koch-buehne")!;
  stage.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 400, bottom: 700, width: 400, height: 700 }) as DOMRect;
  return { root, stage, onAttempt, unmount: () => void act(() => void render(null, root)) };
}

const attemptButton = (root: Element) => root.querySelector<HTMLElement>(".rz-koch-fertig .rz-knopf-haupt")!;

describe("ghost click (issue #81)", () => {
  it("swallows the click on the button that appears under the finger", () => {
    const m = mountWithState(2);
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    const c = fire(attemptButton(m.root), click(300, 300));
    expect(c.defaultPrevented).toBe(true);
    expect(m.onAttempt).not.toHaveBeenCalled();
    // only that one click
    fire(attemptButton(m.root), click(300, 300));
    expect(m.onAttempt).toHaveBeenCalledTimes(1);
  });

  it("lets a click elsewhere, a keyboard click, a script click and a late click through", () => {
    const m = mountWithState(2);
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    const b = attemptButton(m.root);
    expect(fire(b, click(100, 100)).defaultPrevented).toBe(false);
    expect(fire(b, click(300, 300, { detail: 0 })).defaultPrevented).toBe(false);
    expect(fire(b, click(300, 300, { trusted: false })).defaultPrevented).toBe(false);
    expect(fire(b, click(300, 300, { t: 161 + 500 })).defaultPrevented).toBe(false);
    expect(m.onAttempt).toHaveBeenCalledTimes(4);
  });

  it("swallows the click of each of two quick turns", () => {
    const m = mountWithState(0);
    const text = () => m.root.querySelector(".rz-koch-schritt")!;
    tap(text(), 300, 300);
    expect(fire(text(), click(300, 300)).defaultPrevented).toBe(true);
    pointer(text(), "pointerdown", 40, 300, 200);
    pointer(text(), "pointerup", 40, 300, 240);
    expect(fire(text(), click(40, 300, { t: 250 })).defaultPrevented).toBe(true);
  });

  it("drops the expectation when a new finger touches down", () => {
    const m = mountWithState(2);
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    pointer(attemptButton(m.root), "pointerdown", 300, 300, 200);
    expect(fire(attemptButton(m.root), click(300, 300, { t: 210 })).defaultPrevented).toBe(false);
  });

  it("removes its listeners on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const m = mountWithState(2);
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    m.unmount();
    expect(remove.mock.calls.filter(([t]) => t === "click" || t === "pointerdown")).toHaveLength(2);
    const c = click(300, 300);
    document.body.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(false);
  });
});

describe("hint (issue #57)", () => {
  it("shows once and reports it", () => {
    const m = mount({ tapHintSeen: false });
    expect(m.onTapHintSeen).toHaveBeenCalledTimes(1);
    expect(m.root.querySelector(".rz-koch-tipp")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays away without touch and is not marked as seen, so a phone still shows it", () => {
    const m = mount({ tapHintSeen: false, touch: false });
    expect(m.onTapHintSeen).not.toHaveBeenCalled();
    expect(m.root.querySelector(".rz-koch-tipp")).toBeNull();
  });

  it("stays away once it was seen", () => {
    const m = mount({ tapHintSeen: true });
    expect(m.onTapHintSeen).not.toHaveBeenCalled();
    expect(m.root.querySelector(".rz-koch-tipp")).toBeNull();
  });
});
