// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
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

function mount(timers: Timer[], opts: { open?: boolean; store?: DeviceStore } = {}) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
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
  void act(() => render(h(TimerBar, { api, open: opts.open ?? true, onOpen, store: opts.store }), root));
  return { root, api, onOpen };
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
    const bubble = (root: HTMLElement) => root.querySelector<HTMLButtonElement>(".rz-kugel") as HTMLButtonElement;
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
      expect(bubble(root).getAttribute("aria-label")).toBe("Timers, next: 1:05 left, Soon, 2 more");
      expect(root.querySelector(".rz-kugel-fortschritt")?.getAttribute("stroke-dasharray")).toBe("50 100");
      expect(root.querySelector(".rz-uhren")).toBeNull();
    });

    it("shows hours and minutes for a long timer", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW + 5_400_000 }], { open: false });
      expect(root.querySelector(".rz-kugel-zeit")?.textContent).toBe("1:30");
    });

    it("has no badge for a single timer", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }], { open: false });
      expect(root.querySelector(".rz-kugel-zahl")).toBeNull();
    });

    it("shows the alarm state for a timer that is over, and the list offers Stop", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW - 1000, rang: NOW - 1000 }]);
      expect(bubble(root).classList.contains("fertig")).toBe(true);
      expect(root.querySelector(".rz-kugel-zeit")?.textContent).toBe("Done");
      expect(bubble(root).getAttribute("aria-label")).toBe("Timers, Boil pasta is done");
    });

    it("opens and closes with a tap, and says so", () => {
      const closed = mount([{ ...base, id: "a", endAt: NOW + 65_000 }], { open: false });
      expect(bubble(closed.root).getAttribute("aria-expanded")).toBe("false");
      void act(() => bubble(closed.root).click());
      expect(closed.onOpen).toHaveBeenCalledWith(true);
      const open = mount([{ ...base, id: "a", endAt: NOW + 65_000 }]);
      expect(bubble(open.root).getAttribute("aria-expanded")).toBe("true");
      void act(() => bubble(open.root).click());
      expect(open.onOpen).toHaveBeenCalledWith(false);
    });

    it("closes with the close button and with a tap outside, not with a tap inside", () => {
      const { root, onOpen } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }]);
      pointer(root.querySelector(".rz-uhr")!, "pointerdown", 5, 5);
      expect(onOpen).not.toHaveBeenCalled();
      void act(() => root.querySelector<HTMLButtonElement>(".rz-uhren-kopf button")?.click());
      expect(onOpen).toHaveBeenCalledWith(false);
      onOpen.mockClear();
      pointer(document.body, "pointerdown", 5, 5);
      expect(onOpen).toHaveBeenCalledWith(false);
    });

    it("closes the list when the last timer is gone", () => {
      const { onOpen } = mount([]);
      expect(onOpen).toHaveBeenCalledWith(false);
    });

    it("a drag moves the bubble and remembers the spot, and does not open the list", () => {
      const save = vi.fn();
      const { root, onOpen } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }], {
        open: false,
        store: { load: () => undefined, save },
      });
      const b = bubble(root);
      pointer(b, "pointerdown", 100, 100);
      pointer(b, "pointermove", 103, 102); // below the threshold: still a tap
      expect(b.classList.contains("bewegt")).toBe(false);
      pointer(b, "pointermove", 140, 160);
      expect(b.classList.contains("bewegt")).toBe(true);
      pointer(b, "pointerup", 140, 160);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toMatchObject({ side: expect.stringMatching(/left|right/) as string });
      void act(() => b.click()); // the click after the release
      expect(onOpen).not.toHaveBeenCalled();
      void act(() => b.click()); // the next tap works again
      expect(onOpen).toHaveBeenCalledWith(true);
    });

    it("starts at the remembered side", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }], {
        open: false,
        store: { load: () => ({ side: "left", y: 0 }), save: vi.fn() },
      });
      expect(bubble(root).style.left).toBe("8px");
      expect(bubble(root).style.top).toBe("8px");
    });

    it("ignores a stored value that is not an anchor", () => {
      const { root } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }], {
        open: false,
        store: { load: () => "junk", save: vi.fn() },
      });
      expect(bubble(root)).not.toBeNull();
    });
  });
});
