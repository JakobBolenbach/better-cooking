// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { TimerBar } from "../src/ui/timerBar";
import { setLanguage } from "../src/i18n";
import type { Timer } from "../src/timers";
import type { TimerApi } from "../src/timerStore";
import type { DeviceStore } from "../src/ui/useBubblePlace";

const NOW = 1_000_000;
const base = { label: "Boil pasta", recipePath: "Recipes/Pasta.md" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

interface Opts {
  open?: boolean;
  store?: DeviceStore;
  cooking?: boolean;
  /** Size of the view; the layout of jsdom has none, so it is given like the browser would measure it. */
  view?: [number, number];
  vars?: Record<string, string>;
}

function Harness(p: {
  api: TimerApi;
  open: boolean;
  onOpen: (o: boolean) => void;
  store?: DeviceStore;
  cooking: boolean;
  closeRef: { current: (() => void) | null };
}) {
  const [open, setOpen] = useState(p.open);
  p.closeRef.current = () => setOpen(false);
  return h(TimerBar, {
    api: p.api,
    open,
    onOpen: (o: boolean) => {
      p.onOpen(o);
      setOpen(o);
    },
    store: p.store,
    cooking: p.cooking,
  });
}

function mount(timers: Timer[], opts: Opts = {}) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  root.className = "rz-root";
  const [w, hgt] = opts.view ?? [390, 844];
  const size = { w, h: hgt };
  Object.defineProperty(root, "clientWidth", { get: () => size.w });
  Object.defineProperty(root, "clientHeight", { get: () => size.h });
  for (const [k, v] of Object.entries({ "--rz-unten": "34px", "--rz-koch-fuss": "84px", ...opts.vars }))
    root.style.setProperty(k, v);
  const api = {
    get: () => timers,
    subscribe: () => () => undefined,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    addMinute: vi.fn(),
    stop: vi.fn(),
  } satisfies TimerApi;
  const onOpen = vi.fn();
  const closeRef = { current: null as (() => void) | null };
  const view = (o: Opts) =>
    h(Harness, { api, open: o.open ?? true, onOpen, store: o.store, cooking: o.cooking ?? false, closeRef });
  void act(() => render(view(opts), root));
  /** Another size of the view, as after turning the phone. */
  const resize = (nw: number, nh: number) => {
    size.w = nw;
    size.h = nh;
    void act(() => void window.dispatchEvent(new Event("resize")));
  };
  return { root, api, onOpen, resize, close: () => void act(() => closeRef.current?.()) };
}
const names = (root: HTMLElement) =>
  Array.from(root.querySelectorAll(".rz-uhr button")).map((b) => b.getAttribute("aria-label"));

describe("timer bar", () => {
  it("shows nothing without timers", () => {
    expect(mount([]).root.querySelector(".rz-uhren")).toBeNull();
  });

  it("shows the remaining time, pause, one more minute and remove, each named with the timer", () => {
    const { root, api } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }]);
    expect(root.querySelector(".rz-uhr-zeit")?.textContent).toBe("1:05");
    expect(names(root)).toEqual(["Pause: Boil pasta", "+1 min Boil pasta", "Remove timer: Boil pasta"]);
    // The visible text is part of the accessible name.
    expect(root.querySelectorAll(".rz-uhr button")[1].textContent).toBe("+1 min");
    const [pause, plus, remove] = Array.from(root.querySelectorAll<HTMLButtonElement>(".rz-uhr button"));
    void act(() => pause.click());
    void act(() => plus.click());
    void act(() => remove.click());
    expect(api.pause).toHaveBeenCalledWith("a");
    expect(api.addMinute).toHaveBeenCalledWith("a");
    expect(api.stop).toHaveBeenCalledWith("a");
  });

  it("ticks once a second while a timer runs", () => {
    const { root } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }]);
    void act(() => void vi.advanceTimersByTime(3000));
    expect(root.querySelector(".rz-uhr-zeit")?.textContent).toBe("1:02");
  });

  it("offers continue for a paused timer", () => {
    const { root, api } = mount([{ ...base, id: "a", endAt: 0, pausedLeft: 30_000 }]);
    expect(names(root)[0]).toBe("Resume: Boil pasta");
    expect(root.querySelector(".rz-uhr")?.classList.contains("pause")).toBe(true);
    void act(() => root.querySelector<HTMLButtonElement>(".rz-uhr button")?.click());
    expect(api.resume).toHaveBeenCalledWith("a");
  });

  it("shows Stop for a timer that is over", () => {
    const { root, api } = mount([{ ...base, id: "a", endAt: NOW - 1000, rang: NOW - 1000 }]);
    expect(root.querySelector(".rz-uhr")?.classList.contains("fertig")).toBe(true);
    expect(names(root)).toEqual(["+1 min Boil pasta", "Stop: Boil pasta"]);
    void act(() => root.querySelector<HTMLButtonElement>(".rz-uhr-stopp")?.click());
    expect(api.stop).toHaveBeenCalledWith("a");
  });

  describe("bubble", () => {
    const one: Timer[] = [{ ...base, id: "a", endAt: NOW + 65_000 }];
    const bubble = (root: HTMLElement) => root.querySelector<HTMLButtonElement>(".rz-kugel") as HTMLButtonElement;
    const at = (root: HTMLElement) => [bubble(root).style.left, bubble(root).style.top];
    const pointer = (el: Element, type: string, x: number, y: number) =>
      void act(() => {
        el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
      });

    it("shows the time of the next timer and the number of the others as a badge", () => {
      const { root } = mount(
        [
          { ...base, id: "a", label: "Later", endAt: NOW + 600_000, total: 600_000 },
          { ...base, id: "b", label: "Soon", endAt: NOW + 65_000, total: 130_000 },
          { ...base, id: "c", endAt: NOW + 900_000 },
        ],
        { open: false },
      );
      expect(root.querySelector(".rz-kugel-zeit")?.textContent).toBe("1:05");
      expect(root.querySelector(".rz-kugel-zahl")?.textContent).toBe("+2");
      // to the minute: the name does not change every second
      expect(bubble(root).getAttribute("aria-label")).toBe("Timers, next: 2 min left, Soon, 2 more");
      expect(root.querySelector(".rz-kugel-fortschritt")?.getAttribute("stroke-dasharray")).toBe("50 100");
      expect(root.querySelector(".rz-uhren")).toBeNull();
    });

    it("keeps the name for the whole minute while the time ticks", () => {
      const { root } = mount(one, { open: false });
      const name = bubble(root).getAttribute("aria-label");
      void act(() => void vi.advanceTimersByTime(3000));
      expect(root.querySelector(".rz-kugel-zeit")?.textContent).toBe("1:02");
      expect(bubble(root).getAttribute("aria-label")).toBe(name);
    });

    it("shows hours and minutes for a long timer", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW + 5_400_000 }], { open: false });
      expect(root.querySelector(".rz-kugel-zeit")?.textContent).toBe("1h30");
    });

    it("has no badge for a single timer and no ring for a timer saved without its length", () => {
      const { root } = mount(one, { open: false });
      expect(root.querySelector(".rz-kugel-zahl")).toBeNull();
      expect(root.querySelector(".rz-kugel-ring")).toBeNull();
    });

    it("shows the alarm state for a timer that is over", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW - 1000, rang: NOW - 1000 }]);
      expect(bubble(root).classList.contains("fertig")).toBe(true);
      expect(root.querySelector(".rz-kugel-zeit")?.textContent).toBe("Done");
      expect(bubble(root).getAttribute("aria-label")).toBe(
        "Timers, Boil pasta is done. Tap to stop the alarm and open the list",
      );
    });

    it("a tap on the ringing bubble stops the alarm and opens the list", () => {
      const { root, api, onOpen } = mount([{ ...base, id: "a", endAt: NOW - 1000, rang: NOW - 1000 }], {
        open: false,
      });
      void act(() => bubble(root).click());
      expect(api.stop).toHaveBeenCalledWith("a");
      expect(onOpen).toHaveBeenCalledWith(true);
    });

    it("opens and closes with a tap, and says so", () => {
      const { root, onOpen } = mount(one, { open: false });
      expect(bubble(root).getAttribute("aria-expanded")).toBe("false");
      void act(() => bubble(root).click());
      expect(onOpen).toHaveBeenLastCalledWith(true);
      expect(bubble(root).getAttribute("aria-expanded")).toBe("true");
      expect(bubble(root).getAttribute("aria-controls")).toBe(root.querySelector(".rz-uhren")?.id);
      void act(() => bubble(root).click());
      expect(onOpen).toHaveBeenLastCalledWith(false);
    });

    it("closes with the close button and with a tap outside, not with a tap inside", () => {
      const { root, onOpen } = mount(one);
      pointer(root.querySelector(".rz-uhr") as Element, "pointerdown", 5, 5);
      expect(onOpen).not.toHaveBeenCalled();
      void act(() => root.querySelector<HTMLButtonElement>(".rz-uhren-kopf button")?.click());
      expect(onOpen).toHaveBeenCalledWith(false);
      onOpen.mockClear();
      const again = mount(one);
      pointer(document.body, "pointerdown", 5, 5);
      expect(again.onOpen).toHaveBeenCalledWith(false);
    });

    it("closes the list when the last timer is gone", () => {
      const { onOpen } = mount([]);
      expect(onOpen).toHaveBeenCalledWith(false);
    });

    it("sets the room it needs at the bottom of the pages while it is there", () => {
      const { root } = mount(one, { open: false });
      expect(root.style.getPropertyValue("--rz-kugel")).toBe("72px");
    });

    describe("place", () => {
      it("starts bottom right above the bottom inset, and is invisible until the view is measured", () => {
        const { root } = mount(one, { open: false });
        expect(at(root)).toEqual(["326px", "746px"]); // 390 - 8 - 56, 844 - 34 - 8 - 56
        expect(bubble(root).style.visibility).toBe("");
        const unmeasured = mount(one, { open: false, view: [0, 0] });
        expect(bubble(unmeasured.root).style.visibility).toBe("hidden");
      });

      it("starts above the footer of cooking mode", () => {
        const { root } = mount(one, { open: false, cooking: true });
        expect(at(root)).toEqual(["326px", "662px"]); // the footer is 84 px
      });

      it("rests above the footer also for a remembered spot at the very bottom, and after turning the phone", () => {
        const store = { load: () => ({ side: "left", y: 1 }), save: vi.fn() };
        const { root, resize } = mount(one, { open: false, cooking: true, store });
        expect(at(root)).toEqual(["8px", "662px"]);
        resize(844, 390);
        expect(at(root)).toEqual(["8px", "208px"]); // 390 - 34 - 84 - 8 - 56
        resize(390, 844);
        expect(at(root)).toEqual(["8px", "662px"]);
      });

      it("keeps the same spot without cooking mode: down to the home indicator", () => {
        const store = { load: () => ({ side: "right", y: 1 }), save: vi.fn() };
        const { root } = mount(one, { open: false, store });
        expect(at(root)).toEqual(["326px", "746px"]);
      });

      it("stays above the on-screen keyboard", () => {
        const { root } = mount(one, { open: false, vars: { "--rz-tastatur": "300px" } });
        expect(at(root)).toEqual(["326px", "480px"]); // 844 - 300 - 8 - 56
      });

      it("keeps clear of the safe areas at the sides", () => {
        const { root } = mount(one, { open: false, vars: { "--rz-rechts": "47px" } });
        expect(at(root)[0]).toBe("279px"); // 390 - 47 - 8 - 56
      });

      it("starts at the remembered side and height", () => {
        const { root } = mount(one, {
          open: false,
          store: { load: () => ({ side: "left", y: 0 }), save: vi.fn() },
        });
        expect(at(root)).toEqual(["8px", "8px"]);
      });

      it("ignores a stored value that is not an anchor", () => {
        const { root } = mount(one, { open: false, store: { load: () => "junk", save: vi.fn() } });
        expect(at(root)).toEqual(["326px", "746px"]);
      });
    });

    describe("drag", () => {
      it("a tap with a small shake is no drag; a drag moves the bubble, snaps and remembers, and does not open the list", () => {
        const save = vi.fn();
        const { root, onOpen } = mount(one, { open: false, store: { load: () => undefined, save } });
        const b = bubble(root);
        pointer(b, "pointerdown", 354, 774);
        pointer(b, "pointermove", 357, 776);
        expect(b.classList.contains("bewegt")).toBe(false);
        pointer(b, "pointermove", 100, 300);
        expect(b.classList.contains("bewegt")).toBe(true);
        expect(at(root)).toEqual(["72px", "272px"]);
        pointer(b, "pointerup", 100, 300);
        expect(at(root)).toEqual(["8px", "272px"]); // snapped to the left edge
        expect(b.classList.contains("bewegt")).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
        expect((save.mock.calls[0] as [{ side: string; y: number }])[0]).toMatchObject({ side: "left" });
        void act(() => b.click()); // the click after the release
        expect(onOpen).not.toHaveBeenCalled();
        void act(() => b.click()); // the next tap works again
        expect(onOpen).toHaveBeenCalledWith(true);
      });

      it("stays inside the view and above the footer while dragged", () => {
        const { root } = mount(one, { open: false, cooking: true });
        const b = bubble(root);
        pointer(b, "pointerdown", 354, 690);
        pointer(b, "pointermove", 900, 2000);
        expect(at(root)).toEqual(["326px", "662px"]);
        pointer(b, "pointermove", -500, -500);
        expect(at(root)).toEqual(["8px", "8px"]);
        pointer(b, "pointerup", -500, -500);
      });

      it("a cancelled drag goes back and remembers nothing", () => {
        const save = vi.fn();
        const { root, onOpen } = mount(one, { open: false, store: { load: () => undefined, save } });
        const b = bubble(root);
        pointer(b, "pointerdown", 354, 774);
        pointer(b, "pointermove", 100, 300);
        expect(at(root)).toEqual(["72px", "272px"]);
        pointer(b, "pointercancel", 100, 300);
        expect(at(root)).toEqual(["326px", "746px"]);
        expect(b.classList.contains("bewegt")).toBe(false);
        expect(save).not.toHaveBeenCalled();
        void act(() => b.click());
        expect(onOpen).toHaveBeenCalledWith(true); // no click is held back
      });

      it("a lost pointer capture ends the drag like a cancel", () => {
        const save = vi.fn();
        const { root } = mount(one, { open: false, store: { load: () => undefined, save } });
        const b = bubble(root);
        pointer(b, "pointerdown", 354, 774);
        pointer(b, "pointermove", 100, 300);
        pointer(b, "lostpointercapture", 100, 300);
        expect(at(root)).toEqual(["326px", "746px"]);
        expect(save).not.toHaveBeenCalled();
      });

      it("a click long after a drag, or a key press, is a real tap", () => {
        const { root, onOpen } = mount(one, { open: false, store: { load: () => undefined, save: vi.fn() } });
        const b = bubble(root);
        pointer(b, "pointerdown", 354, 774);
        pointer(b, "pointermove", 100, 300);
        pointer(b, "pointerup", 100, 300);
        void act(() => void vi.advanceTimersByTime(1000));
        void act(() => b.click());
        expect(onOpen).toHaveBeenCalledWith(true);
        onOpen.mockClear();
        pointer(b, "pointerdown", 30, 280);
        pointer(b, "pointermove", 200, 500);
        pointer(b, "pointerup", 200, 500);
        void act(() => void b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        void act(() => b.click());
        expect(onOpen).toHaveBeenCalled();
      });

      it("keeps touches on the bubble from reaching Obsidian's swipe gestures", () => {
        const { root } = mount(one, { open: false });
        const seen = vi.fn();
        document.addEventListener("touchmove", seen);
        document.addEventListener("touchstart", seen);
        const move = new Event("touchmove", { bubbles: true, cancelable: true });
        void act(() => {
          bubble(root).dispatchEvent(new Event("touchstart", { bubbles: true }));
          bubble(root).dispatchEvent(move);
        });
        expect(seen).not.toHaveBeenCalled();
        expect(move.defaultPrevented).toBe(true);
        document.removeEventListener("touchmove", seen);
        document.removeEventListener("touchstart", seen);
      });
    });

    describe("focus", () => {
      const focusClose = (root: HTMLElement) => {
        const btn = root.querySelector<HTMLButtonElement>(".rz-uhren-kopf button") as HTMLButtonElement;
        void act(() => btn.focus());
        return btn;
      };
      it("goes back to the bubble when the list closes from inside (close button)", () => {
        const { root } = mount(one);
        void act(() => focusClose(root).click());
        expect(document.activeElement).toBe(bubble(root));
      });
      it("goes back to the bubble when the list closes by Esc", () => {
        const { root, close } = mount(one);
        focusClose(root);
        close();
        expect(document.activeElement).toBe(bubble(root));
      });
      it("is not taken from where a tap outside puts it", () => {
        const { root } = mount(one);
        focusClose(root);
        const field = document.body.appendChild(document.createElement("input"));
        void act(() => field.focus());
        pointer(field, "pointerdown", 5, 5);
        expect(root.querySelector(".rz-uhren")).toBeNull();
        expect(document.activeElement).toBe(field);
        field.remove();
      });
      it("does not jump to the bubble after a tap outside that left the focus nowhere", () => {
        const { root } = mount(one);
        focusClose(root);
        pointer(document.body, "pointerdown", 5, 5);
        expect(document.activeElement).not.toBe(bubble(root));
      });
    });

    describe("tap outside", () => {
      const withArea = (cooking: boolean) => {
        const m = mount(one, { cooking });
        const area = m.root.appendChild(document.createElement("div"));
        const button = area.appendChild(document.createElement("button"));
        const seen = vi.fn();
        area.addEventListener("pointerdown", seen);
        return { ...m, area, button, seen };
      };
      it("in cooking mode the closing tap on the text does not reach the tap zones", () => {
        const { area, seen, root } = withArea(true);
        pointer(area, "pointerdown", 100, 100);
        expect(seen).not.toHaveBeenCalled();
        expect(root.querySelector(".rz-uhren")).toBeNull();
      });
      it("in cooking mode a tap on a button still reaches it", () => {
        const { button, seen, root } = withArea(true);
        pointer(button, "pointerdown", 100, 100);
        expect(seen).toHaveBeenCalled();
        expect(root.querySelector(".rz-uhren")).toBeNull();
      });
      it("outside cooking mode the tap reaches the page", () => {
        const { area, seen } = withArea(false);
        pointer(area, "pointerdown", 100, 100);
        expect(seen).toHaveBeenCalled();
      });
    });

    it("places the list inside the view, next to the bubble, on a card of its own", () => {
      const { root } = mount(one);
      const panel = root.querySelector<HTMLElement>(".rz-uhren") as HTMLElement;
      expect(panel.style.width).toBe("374px"); // 390 - 2 * 8, below the widest list
      expect(panel.style.left).toBe("8px"); // 326 + 56 - 374
      expect(panel.style.maxHeight).toBe(`${844 - 34 - 16}px`);
    });
  });
});
