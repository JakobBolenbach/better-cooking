// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { RecipeEditor } from "../src/ui/recipeEditor";
import type { EditApi, SaveResult, Saved } from "../src/ui/editApi";
import { draftOfText, type RecipeDraft } from "../src/recipeEdit";
import { FIELD_PRESETS } from "../src/noteFormat";
import { moved, stateOf } from "../src/ui/useRecipeDraft";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";

const NOTE = `---
typ: rezept
kategorie: Suppe
ergebnis: "4 Portionen"
zeit_aktiv: 20
---
# Suppe

## Zutaten
**Gemüse**
- 1 Zwiebel
- 2 Möhren

## Schritte
1. **Kochen:** Alles kochen.
2. Essen.
3. Abwaschen.

## Tipps
- Mit Brot.
`;

const base = (text = NOTE): RecipeDraft => draftOfText(text, FIELD_PRESETS.de);
const root = () => document.body.firstElementChild as HTMLElement;

interface Setup {
  save: Mock<EditApi["save"]>;
  closed: Mock<() => void>;
  saved: Mock<(s: Saved) => void>;
  dirty: Mock<(d: boolean) => void>;
  guard: { current: (() => boolean) | null };
}

async function open(o: { text?: string; result?: SaveResult; translations?: boolean } = {}): Promise<Setup> {
  const save = vi.fn<EditApi["save"]>(() => Promise.resolve(o.result ?? { ok: true as const, parts: [] }));
  const api: EditApi = {
    open: () => Promise.resolve({ ok: true, base: base(o.text) }),
    save,
  };
  const s: Setup = {
    save,
    closed: vi.fn<() => void>(),
    saved: vi.fn<(s: Saved) => void>(),
    dirty: vi.fn<(d: boolean) => void>(),
    guard: { current: null },
  };
  const r = { ...parseRecipe("Rezepte/Suppe.md", o.text ?? NOTE), imageSrcs: [] };
  const host = document.createElement("div");
  host.className = "rz-app";
  document.body.appendChild(host);
  await act(() => {
    render(
      h(RecipeEditor, {
        r,
        api,
        categories: ["Suppe", "Kuchen"],
        translations: !!o.translations,
        guard: s.guard,
        onDirty: s.dirty,
        onSaved: s.saved,
        onCloseView: s.closed,
      }),
      host,
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 0)));
  return s;
}

const buttons = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => b.textContent === label || b.getAttribute("aria-label")?.startsWith(label),
  );
const button = (label: string) => {
  const b = buttons(label)[0];
  if (!b) throw new Error(`no button ${label}`);
  return b;
};
const field = (label: string): HTMLInputElement | HTMLTextAreaElement => {
  const l = [...document.querySelectorAll("label")].find(
    (x) => x.querySelector(".rz-feld-name")?.textContent === label,
  );
  const f = l?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (!f) throw new Error(`no field ${label}`);
  return f;
};
const type = async (f: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  f.value = value;
  await act(() => void f.dispatchEvent(new Event("input", { bubbles: true })));
};
const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const click = async (b: HTMLElement) => {
  await act(() => void b.click());
  await tick();
};

beforeEach(() => setLanguage("en"));
afterEach(() => {
  document.querySelectorAll("body > div").forEach((el) => render(null, el));
  document.body.innerHTML = "";
});

describe("recipe editor dialog", () => {
  it("shows the note and starts clean: Save is disabled, Cancel closes without asking", async () => {
    const s = await open();
    expect(field("Title").value).toBe("Suppe");
    expect(field("Yield").value).toBe("4 Portionen");
    expect(field("Active time (min)").value).toBe("20");
    expect(field("Category").value).toBe("Suppe");
    expect(document.querySelectorAll("#rz-edit-kategorien option")).toHaveLength(2);
    expect(button("Save").disabled).toBe(true);
    expect(s.guard.current?.()).toBe(false);
    await click(button("Cancel"));
    expect(s.closed).toHaveBeenCalledTimes(1);
  });

  it("a change enables Save and reports dirty; changing it back disables Save again", async () => {
    const s = await open();
    await type(field("Title"), "Gemüsesuppe");
    expect(button("Save").disabled).toBe(false);
    expect(s.dirty).toHaveBeenLastCalledWith(true);
    await type(field("Title"), "Suppe");
    expect(button("Save").disabled).toBe(true);
    expect(s.dirty).toHaveBeenLastCalledWith(false);
  });

  it("Cancel and Esc ask when there are changes; keep editing goes on, discard closes", async () => {
    const s = await open();
    await type(field("Yield"), "6 Portionen");
    await click(button("Cancel"));
    expect(s.closed).not.toHaveBeenCalled();
    expect(root().textContent).toContain("Discard your changes?");
    await click(button("Keep editing"));
    expect(root().textContent).not.toContain("Discard your changes?");
    let handled: boolean | undefined;
    await act(() => {
      handled = s.guard.current?.();
    });
    expect(handled).toBe(true);
    expect(root().textContent).toContain("Discard your changes?");
    await click(button("Discard"));
    expect(s.closed).toHaveBeenCalledTimes(1);
    expect(s.save).not.toHaveBeenCalled();
  });

  it("saves the draft with the base it was opened with and reports the step counts", async () => {
    const s = await open({ result: { ok: true, parts: ["steps"] } });
    await click(buttons("Delete step: Step 3")[0]);
    await click(button("Save"));
    expect(s.save).toHaveBeenCalledTimes(1);
    const [path, b, draft] = s.save.mock.calls[0];
    expect(path).toBe("Rezepte/Suppe.md");
    expect(b.steps).toHaveLength(3);
    expect(draft.steps.map((x) => x.text)).toEqual(["Alles kochen.", "Essen."]);
    expect(s.saved).toHaveBeenCalledWith({ stepsChanged: true });
  });

  it("steps move up and down; the first cannot go up, the last cannot go down", async () => {
    const s = await open();
    expect(buttons("Move up: Step 1")[0].disabled).toBe(true);
    expect(buttons("Move down: Step 3")[0].disabled).toBe(true);
    await click(buttons("Move down: Step 1")[0]);
    await click(button("Save"));
    const draft = s.save.mock.calls[0][2];
    expect(draft.steps.map((x) => x.text)).toEqual(["Essen.", "Alles kochen.", "Abwaschen."]);
  });

  it("adds a step and a group; ingredients are one per line", async () => {
    const s = await open();
    await click(button("+ Step"));
    const texts = [...document.querySelectorAll<HTMLTextAreaElement>(".rz-edit-karte textarea")];
    await type(texts[texts.length - 1], "Servieren.");
    await click(button("+ Group"));
    const names = [...document.querySelectorAll<HTMLInputElement>(".rz-edit-karte input")];
    const lastGroupName = names.find((i) => i.closest(".rz-edit-karte")?.textContent?.includes("One ingredient"));
    expect(lastGroupName).toBeTruthy();
    await click(button("Save"));
    const draft = s.save.mock.calls[0][2];
    expect(draft.steps.at(-1)).toEqual({ title: "", text: "Servieren.", ingredients: "" });
    expect(draft.ingredients[0].items).toEqual(["1 Zwiebel", "2 Möhren"]);
  });

  it("a group without a name after the first, or a time out of range, blocks Save and says why", async () => {
    await open();
    await click(button("+ Group"));
    const areas = [...document.querySelectorAll<HTMLTextAreaElement>(".rz-edit-karte")]
      .filter((c) => c.textContent?.includes("One ingredient"))
      .map((c) => c.querySelector("textarea")!);
    await type(areas[areas.length - 1], "1 Prise Salz");
    expect(button("Save").disabled).toBe(true);
    expect(root().textContent).toContain("Every group after the first needs a name.");
    await type(field("Active time (min)"), "99999");
    expect(root().textContent).toContain("Times: 0 to 10000 minutes.");
  });

  it("a conflict takes the new text for the parts the user did not change and asks about the ones both changed", async () => {
    const current = base(NOTE.replace("Abwaschen.", "Gründlich abwaschen.").replace("Mit Brot.", "Mit Butter."));
    const s = await open({
      result: {
        ok: false,
        conflict: true,
        message: "The note changed in the meantime.",
        parts: ["steps"],
        base: current,
      },
    });
    await type(field("Title"), "Neu");
    const steps = [...document.querySelectorAll<HTMLTextAreaElement>(".rz-edit-karte textarea")];
    await type(steps[steps.length - 2], "Anders essen.");
    await click(button("Save"));
    expect(root().textContent).toContain("The note changed in the meantime.");
    expect(root().textContent).toContain("Steps: This part changed in the meantime.");
    // not changed by the user: the new text; changed by the user: kept
    expect(field("Title").value).toBe("Neu");
    expect([...document.querySelectorAll("textarea")].some((t) => t.value === "Mit Butter.")).toBe(true);
    expect([...document.querySelectorAll("textarea")].some((t) => t.value === "Anders essen.")).toBe(true);
    // the user decides first
    expect(button("Save").disabled).toBe(true);
    expect(root().textContent).toContain("First decide");
    await click(button("Take the new one"));
    expect([...document.querySelectorAll("textarea")].some((t) => t.value === "Gründlich abwaschen.")).toBe(true);
    // the new version can be looked at, and taking it is reversible until the note is saved
    expect(root().querySelector(".rz-edit-konflikt pre")?.textContent).toContain("Gründlich abwaschen.");
    expect(button("Save").disabled).toBe(false);
    expect(root().textContent).not.toContain("First decide");
    expect(field("Title").value).toBe("Neu");
    await click(button("Restore my version"));
    expect([...document.querySelectorAll("textarea")].some((t) => t.value === "Anders essen.")).toBe(true);
    expect(s.closed).not.toHaveBeenCalled();
  });

  it("no conflict is shown when the user's version equals the new one", async () => {
    const current = base(NOTE.replace("Abwaschen.", "Spülen."));
    await open({ result: { ok: false, conflict: true, message: "x", parts: ["steps"], base: current } });
    const steps = [...document.querySelectorAll<HTMLTextAreaElement>(".rz-edit-karte textarea")];
    await type(steps[steps.length - 1], "Spülen.");
    await click(button("Save"));
    expect(root().querySelector(".rz-edit-konflikt")).toBeNull();
    expect(button("Save").disabled).toBe(true);
  });

  it("'keep my version' keeps the user's text and enables Save again", async () => {
    const current = base(NOTE.replace("Abwaschen.", "Gründlich abwaschen."));
    await open({ result: { ok: false, conflict: true, message: "x", parts: ["steps"], base: current } });
    const steps = [...document.querySelectorAll<HTMLTextAreaElement>(".rz-edit-karte textarea")];
    await type(steps[steps.length - 1], "Mein Text.");
    await click(button("Save"));
    await click(button("Keep my version"));
    expect([...document.querySelectorAll("textarea")].some((t) => t.value === "Mein Text.")).toBe(true);
    expect(button("Save").disabled).toBe(false);
  });

  it("removing a group puts the focus on a button that still exists", async () => {
    await open();
    await click(button("+ Group"));
    await click(button("+ Group"));
    await click(buttons("Remove group")[1]);
    expect(document.activeElement?.getAttribute("aria-label")?.startsWith("Remove group")).toBe(true);
    await click(buttons("Remove group")[0]);
    expect(document.activeElement?.textContent).toBe("+ Group");
  });

  it("a note with odd lines (marker, escape, tab) opens clean", async () => {
    const odd = NOTE.replace("- 1 Zwiebel", "- • 200 g Mehl")
      .replace("- 2 Möhren", "- \\- x")
      .replace("2. Essen.", "2.\tEssen\t.");
    const s = await open({ text: odd });
    expect(button("Save").disabled).toBe(true);
    expect(s.dirty).not.toHaveBeenCalledWith(true);
    await click(button("Cancel"));
    expect(s.closed).toHaveBeenCalledTimes(1);
  });

  it("shows a servings field only for a note that has one", async () => {
    await open({ text: NOTE.replace("zeit_aktiv: 20", "portionen: 4\nzeit_aktiv: 20") });
    expect(field("Servings (number)").value).toBe("4");
  });

  it("the ask moves the focus to its safe answer and back to Cancel", async () => {
    await open();
    await type(field("Title"), "Neu");
    await click(button("Cancel"));
    expect(document.activeElement?.textContent).toBe("Keep editing");
    await click(button("Keep editing"));
    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  it("moving a step to the top keeps the focus on a working button of that step", async () => {
    await open();
    await click(buttons("Move up: Step 2")[0]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move down: Step 1");
  });

  it("a category that is a YAML list is shown, not editable", async () => {
    await open({ text: NOTE.replace("kategorie: Suppe", "kategorie:\n  - Suppe\n  - Winter") });
    expect(document.querySelector('input[list="rz-edit-kategorien"]')).toBeNull();
    expect(root().textContent).toContain("In this note the category is a list (Suppe, Winter). Change it in Obsidian.");
  });

  it("says that translations do not change with it", async () => {
    await open({ translations: true });
    expect(root().textContent).toContain("Translations do not change with it.");
  });

  it("times are typed with the numeric keyboard", async () => {
    await open();
    expect(field("Active time (min)").getAttribute("inputmode")).toBe("numeric");
    expect(field("Total time (min)").getAttribute("inputmode")).toBe("numeric");
  });
});

describe("state helpers", () => {
  it("moved swaps neighbours and ignores the ends", () => {
    expect(moved([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moved([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moved([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("a note without ingredients starts with one empty group", () => {
    let n = 0;
    const s = stateOf({ title: "T", ingredients: [], steps: [], tips: [] }, () => ++n);
    expect(s.groups).toHaveLength(1);
  });
});
