// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { AttemptModal, type AttemptInput } from "../src/ui/attempt";
import { setLanguage } from "../src/i18n";
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
});
