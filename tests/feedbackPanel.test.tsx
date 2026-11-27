// @vitest-environment jsdom
// The feedback dialog (issue #120): counter, nothing read before the click, the button locked while empty.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { RefetchModal } from "../src/ui/refetchModal";
import type { FeedbackApi } from "../src/ui/feedbackPanel";
import type { FeedbackWay } from "../src/feedback";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

beforeAll(() => setLanguage("de"));
afterEach(() => {
  document.body.querySelectorAll("div").forEach((el) => render(null, el));
  document.body.innerHTML = "";
});

const r = {
  path: "Recipes/A.md",
  title: "A",
  source: "https://example.org/a",
  importState: "fertig",
  ingredients: [],
  steps: [],
  tips: [],
  attempts: [],
  notes: [],
  images: [],
  imageSrcs: [],
} as unknown as RecipeView;

function open(way: FeedbackWay, extra: Partial<FeedbackApi> = {}, onEdit?: () => void) {
  const api: FeedbackApi = {
    way: () => way,
    preview: vi.fn(async () => ({
      ok: true as const,
      changes: [{ part: "steps" as const }],
      via: "ai" as const,
      edited: [],
    })),
    send: vi.fn(async () => ({ ok: true })),
    ...extra,
  };
  const onPreview = vi.fn();
  const onCloseView = vi.fn();
  const root = document.createElement("div");
  root.className = "rz-root";
  document.body.appendChild(root);
  void act(() =>
    render(
      h(RefetchModal, {
        r,
        feedback: { api, onEdit },
        onPreview,
        onApply: async () => ({ ok: true }),
        onCancel: () => undefined,
        onCloseView,
      }),
      root,
    ),
  );
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const button = (text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  return { api, onPreview, onCloseView, root, q, button };
}
/** Clicks and lets the promises of the click settle. */
const click = (b?: HTMLButtonElement) =>
  act(async () => {
    b?.click();
    await new Promise((r) => setTimeout(r, 0));
  });
const type = async (el: HTMLTextAreaElement, value: string) => {
  el.value = value;
  await act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("feedback dialog with the own AI", () => {
  it("reads nothing before the click and shows a counter", async () => {
    const t = open({ via: "ai", material: "page" });
    expect(t.api.preview).not.toHaveBeenCalled();
    expect(t.onPreview).not.toHaveBeenCalled();
    expect(t.root.textContent).toContain("Was ist falsch?");
    expect(t.root.textContent).toContain("0 von 1000 Zeichen");
    await type(t.q("textarea"), "Ofen auf 200 °C");
    expect(t.root.textContent).toContain("15 von 1000 Zeichen");
    expect(t.q<HTMLTextAreaElement>("textarea").maxLength).toBe(1000);
  });
  it("locks the button while the text is empty and passes the text on", async () => {
    const t = open({ via: "ai", material: "page" });
    expect(t.button("Mit meiner KI neu lesen")!.disabled).toBe(true);
    await type(t.q("textarea"), "  \n ");
    expect(t.button("Mit meiner KI neu lesen")!.disabled).toBe(true);
    await type(t.q("textarea"), "Ofen auf 200 °C");
    await click(t.button("Mit meiner KI neu lesen"));
    expect(t.api.preview).toHaveBeenCalledWith("Recipes/A.md", "Ofen auf 200 °C");
    // the result is the normal change list with the update button
    expect(t.root.textContent).toContain("Schritte");
    expect(t.button("Aktualisieren")!.disabled).toBe(false);
  });
});

describe("feedback dialog with a processor", () => {
  it("sends instead of updating, locked while empty", async () => {
    const t = open({ via: "processor", processor: "claude" });
    expect(t.button("Aktualisieren")).toBeUndefined();
    expect(t.button("An Claude senden")!.disabled).toBe(true);
    await type(t.q("textarea"), "weniger Salz");
    await click(t.button("An Claude senden"));
    expect(t.api.send).toHaveBeenCalledWith("Recipes/A.md", "weniger Salz");
    expect(t.onCloseView).toHaveBeenCalled();
  });
  it("stays open and says why when sending fails", async () => {
    const t = open({ via: "processor", processor: "github" }, { send: async () => ({ ok: false, message: "Nein." }) });
    await type(t.q("textarea"), "x");
    await click(t.button("senden"));
    expect(t.onCloseView).not.toHaveBeenCalled();
    expect(t.root.textContent).toContain("Nein.");
  });
});

describe("feedback dialog with nothing set up", () => {
  it("says so and offers the editor", async () => {
    const onEdit = vi.fn();
    const t = open({ via: "none" }, {}, onEdit);
    expect(t.root.textContent).toContain("Feedback braucht deine eigene KI oder einen Verarbeiter.");
    expect(t.root.querySelector("textarea")).toBeNull();
    await click(t.button("Von Hand bearbeiten"));
    expect(onEdit).toHaveBeenCalled();
  });
});
