// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { CookingMode } from "../src/ui/cookingMode";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

const recipe = {
  title: "Pancakes",
  ingredients: [],
  steps: [{ text: "Mix." }, { text: "Rest for 10 minutes." }, { text: "Bake." }],
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

/** A press: pointer down, pointer up, click. */
function tap(el: Element, x: number, y: number, o: { pointerType?: string } = {}) {
  pointer(el, "pointerdown", x, y, 100, o);
  pointer(el, "pointerup", x, y, 160, o);
  void act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y })));
}

afterEach(() => {
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

  it("ignores a click without a press of its own and a second finger", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    void act(() => void text.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 300, clientY: 300 })));
    expect(m.onStep).not.toHaveBeenCalled();
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointerdown", 320, 300, 110, { isPrimary: false });
    pointer(text, "pointerup", 300, 300, 160);
    void act(() => void text.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("ignores a tap right after a scroll", () => {
    const m = mount();
    const e = new Event("scroll");
    Object.defineProperty(e, "timeStamp", { value: 50 });
    void act(() => void m.stage.dispatchEvent(e));
    tap(m.root.querySelector(".rz-koch-schritt")!, 300, 300);
    expect(m.onStep).not.toHaveBeenCalled();
  });

  it("swipes to the left and the right", () => {
    const m = mount();
    const text = m.root.querySelector(".rz-koch-schritt")!;
    pointer(text, "pointerdown", 300, 300, 100);
    pointer(text, "pointermove", 200, 305, 140);
    pointer(text, "pointerup", 200, 305, 160);
    expect(m.onStep).toHaveBeenLastCalledWith(2);
    pointer(text, "pointerdown", 100, 300, 300);
    pointer(text, "pointerup", 220, 300, 360);
    expect(m.onStep).toHaveBeenLastCalledWith(0);
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
