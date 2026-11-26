// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { TimerBar } from "../src/ui/timerBar";
import { setLanguage } from "../src/i18n";
import type { Timer } from "../src/timers";

const NOW = 1_000_000;
const base = { label: "Boil pasta", recipePath: "Recipes/Pasta.md" };

function mount(timers: Timer[]) {
  setLanguage("en");
  const root = document.body.appendChild(document.createElement("div"));
  const on = { onToggle: vi.fn(), onPlusMinute: vi.fn(), onStop: vi.fn() };
  render(h(TimerBar, { timers, now: NOW, ...on }), root);
  return { root, ...on };
}
const buttons = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("button")).map((b) => b.textContent || b.getAttribute("aria-label"));

describe("timer bar", () => {
  it("shows the remaining time, pause, one more minute and remove for a running timer", () => {
    const { root, onPlusMinute, onToggle, onStop } = mount([{ ...base, id: "a", endAt: NOW + 65_000 }]);
    expect(root.querySelector(".rz-uhr-zeit")?.textContent).toBe("1:05");
    expect(buttons(root)).toEqual(["Pause", "+1 min", "Remove timer"]);
    const [pause, plus, remove] = Array.from(root.querySelectorAll("button"));
    pause.click();
    plus.click();
    remove.click();
    expect(onToggle).toHaveBeenCalledWith("a");
    expect(onPlusMinute).toHaveBeenCalledWith("a");
    expect(onStop).toHaveBeenCalledWith("a");
  });

  it("offers continue for a paused timer", () => {
    const { root } = mount([{ ...base, id: "a", endAt: 0, pausedLeft: 30_000 }]);
    expect(buttons(root)[0]).toBe("Resume");
    expect(root.querySelector(".rz-uhr")?.classList.contains("pause")).toBe(true);
  });

  it("shows Stop for a timer that is over", () => {
    const { root, onStop } = mount([{ ...base, id: "a", endAt: NOW - 1000, rang: NOW - 1000 }]);
    expect(root.querySelector(".rz-uhr")?.classList.contains("fertig")).toBe(true);
    expect(buttons(root)).toEqual(["+1 min", "Stop"]);
    root.querySelector<HTMLButtonElement>(".rz-uhr-stopp")?.click();
    expect(onStop).toHaveBeenCalledWith("a");
  });
});
