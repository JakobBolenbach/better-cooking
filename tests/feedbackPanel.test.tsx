// @vitest-environment jsdom
// The feedback dialog (issue #120): counter, nothing read before the click, the button locked while empty.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { FeedbackModal } from "../src/ui/feedbackModal";
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

function open(
  way: FeedbackWay,
  extra: Partial<FeedbackApi> = {},
  onEdit?: () => void,
  onApply: () => Promise<{ ok: boolean; message?: string; stale?: boolean }> = async () => ({ ok: true }),
) {
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
  const onCloseView = vi.fn();
  const root = document.createElement("div");
  root.className = "rz-root";
  document.body.appendChild(root);
  void act(() =>
    render(
      h(FeedbackModal, {
        r,
        api,
        onEdit,
        onApply,
        onCancel: () => undefined,
        onCloseView,
      }),
      root,
    ),
  );
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const button = (text: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  return { api, onCloseView, root, q, button };
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
    const t = open({ via: "processor", processor: "claude", input: "link" });
    expect(t.button("Aktualisieren")).toBeUndefined();
    expect(t.button("An Claude senden")!.disabled).toBe(true);
    await type(t.q("textarea"), "weniger Salz");
    await click(t.button("An Claude senden"));
    expect(t.api.send).toHaveBeenCalledWith("Recipes/A.md", "weniger Salz");
    expect(t.onCloseView).toHaveBeenCalled();
  });
  it("stays open and says why when sending fails", async () => {
    const t = open(
      { via: "processor", processor: "github", input: "text" },
      { send: async () => ({ ok: false, message: "Nein." }) },
    );
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
    expect(t.root.textContent).toContain("Ein Hinweis braucht deine eigene KI oder einen Verarbeiter.");
    expect(t.root.querySelector("textarea")).toBeNull();
    await click(t.button("Von Hand bearbeiten"));
    expect(onEdit).toHaveBeenCalled();
  });
});

describe("feedback dialog texts and details", () => {
  it("says honestly what the processor gets, by the source", () => {
    const link = open({ via: "processor", processor: "claude", input: "link" });
    expect(link.root.textContent).toContain("mit dem Link zum Rezept an Claude, ohne den Text der Notiz");
    const text = open({ via: "processor", processor: "github", input: "text" });
    expect(text.root.textContent).toContain("mit dem Rezepttext der Notiz an GitHub-Action, denn es gibt keinen Link");
  });
  it("says that Facebook is not read", () => {
    const t = open({ via: "ai", material: "note", unread: "facebook" });
    expect(t.root.textContent).toContain("Facebook wird nicht gelesen");
  });
  it("has the counter outside the label, off the live regions, and focuses the field", () => {
    const t = open({ via: "ai", material: "page" });
    const counter = t.q("#rz-hinweis-zaehler");
    expect(counter.closest("label")).toBeNull();
    expect(counter.getAttribute("aria-live")).toBe("off");
    expect(counter.closest("[aria-live=polite]")).toBeNull();
    expect(t.q("textarea").getAttribute("aria-describedby")).toBe("rz-hinweis-zaehler");
    expect(t.root.querySelector("label[for=rz-hinweis-feld]")).not.toBeNull();
    expect(document.activeElement).toBe(t.q("textarea"));
  });
  it("unfolds the new text of a changed part", async () => {
    const t = open(
      { via: "ai", material: "page" },
      {
        preview: vi.fn(async () => ({
          ok: true as const,
          changes: [{ part: "steps" as const }],
          via: "ai" as const,
          edited: [],
          details: { steps: "1. Bei 200 °C backen." },
        })),
      },
    );
    await type(t.q("textarea"), "Ofen auf 200 °C");
    await click(t.button("Mit meiner KI neu lesen"));
    expect(t.root.querySelector("details pre")?.textContent).toBe("1. Bei 200 °C backen.");
  });
  it("reads nothing again when the note changed meanwhile: the list is locked until the next click", async () => {
    const t = open({ via: "ai", material: "page" }, {}, undefined, async () => ({
      ok: false,
      stale: true,
      message: "Die Notiz wurde währenddessen geändert.",
    }));
    await type(t.q("textarea"), "Ofen auf 200 °C");
    await click(t.button("Mit meiner KI neu lesen"));
    await click(t.button("Aktualisieren"));
    expect(t.api.preview).toHaveBeenCalledTimes(1);
    expect(t.root.textContent).toContain("währenddessen geändert");
    expect(t.button("Aktualisieren")!.disabled).toBe(true);
    expect(t.root.querySelector("ul.rz-aenderungen")).toBeNull();
  });
});
