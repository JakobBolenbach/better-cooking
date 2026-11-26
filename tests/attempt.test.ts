// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { AttemptModal, type AttemptInput } from "../src/ui/attempt";
import { setLanguage, formatDate } from "../src/i18n";
import { parseDateInput, todayIso, isoToGerman } from "../src/parse";
import type { RecipeView } from "../src/types";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("AttemptModal", () => {
  it("keeps what was typed into 'what changed' and 'result' and saves it", async () => {
    setLanguage("en");
    const root = document.body.appendChild(document.createElement("div"));
    const onSave = vi.fn((_v: AttemptInput) => Promise.resolve());
    render(h(AttemptModal, { r: { title: "Bread" } as RecipeView, onCloseView: () => {}, onSave }), root);
    const [changed, result] = Array.from(root.querySelectorAll("textarea"));
    changed.value = "more salt";
    changed.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    result.value = "crispier";
    result.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(changed.value).toBe("more salt");
    const save = root.querySelector<HTMLButtonElement>(".rz-knopf-haupt")!;
    save.click();
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ modified: "more salt", result: "crispier" });
  });

  it("shows the date in the interface language but saves it as DD.MM.YYYY (issue #45)", async () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onSave = vi.fn((_v: AttemptInput) => Promise.resolve());
    for (const lang of ["en", "de"] as const) {
      setLanguage(lang);
      render(h(AttemptModal, { r: { title: "Bread" } as RecipeView, onCloseView: () => {}, onSave }), root);
      const input = root.querySelector<HTMLInputElement>("input[type=text]")!;
      expect(input.value).toBe(formatDate(todayIso()));
      root.querySelector<HTMLButtonElement>(".rz-knopf-haupt")!.click();
      await flush();
      expect(onSave.mock.calls.at(-1)![0].date).toBe(isoToGerman(todayIso()));
      render(null, root);
    }
    expect(formatDate("2026-11-26")).toBe("26.11.2026");
    setLanguage("en");
    expect(formatDate("2026-11-26")).toBe("26 Nov 2026");
  });
});

describe("parseDateInput", () => {
  it("reads German, ISO and English display dates", () => {
    expect(parseDateInput("26.11.2026")).toBe("2026-11-26");
    expect(parseDateInput("6.1.2026")).toBe("2026-01-06");
    expect(parseDateInput("2026-11-26")).toBe("2026-11-26");
    expect(parseDateInput(" 26 Nov 2026 ")).toBe("2026-11-26");
    expect(parseDateInput("3 Sept 2026")).toBe("2026-09-03");
  });
  it("rejects nonsense and days that do not exist", () => {
    for (const bad of ["", "tomorrow", "31.02.2026", "26 Foo 2026", "26.11.26", "2026-13-01"])
      expect(parseDateInput(bad), bad).toBeUndefined();
  });
});
