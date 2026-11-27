// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { TimerBar } from "../src/ui/timerBar";
import { setLanguage } from "../src/i18n";
import type { Timer } from "../src/timers";
import type { TimerApi } from "../src/timerStore";

const NOW = 1_000_000;
const base = { label: "Boil pasta", recipePath: "Recipes/Pasta.md" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function mount(timers: Timer[]) {
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
  void act(() => render(h(TimerBar, { api }), root));
  return { root, api };
}
const names = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));

describe("timer bar", () => {
  it("shows nothing without timers", () => {
    expect(mount([]).root.querySelector(".rz-uhren")).toBeNull();
  });

  it("shows the remaining time, pause, one more minute and remove, each named with the timer", () => {
    const { root, api } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }]);
    expect(root.querySelector(".rz-uhr-zeit")?.textContent).toBe("1:05");
    expect(names(root)).toEqual(["Pause: Boil pasta", "+1 min Boil pasta", "Remove timer: Boil pasta"]);
    // The visible text is part of the accessible name.
    expect(root.querySelectorAll("button")[1].textContent).toBe("+1 min");
    const [pause, plus, remove] = Array.from(root.querySelectorAll("button"));
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
    void act(() => root.querySelector("button")?.click());
    expect(api.resume).toHaveBeenCalledWith("a");
  });

  it("shows Stop for a timer that is over", () => {
    const { root, api } = mount([{ ...base, id: "a", endAt: NOW - 1000, rang: NOW - 1000 }]);
    expect(root.querySelector(".rz-uhr")?.classList.contains("fertig")).toBe(true);
    expect(names(root)).toEqual(["+1 min Boil pasta", "Stop: Boil pasta"]);
    void act(() => root.querySelector<HTMLButtonElement>(".rz-uhr-stopp")?.click());
    expect(api.stop).toHaveBeenCalledWith("a");
  });
});
