// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { EditSteps } from "../src/ui/editSteps";
import { draftOfState, stateOf } from "../src/ui/useRecipeDraft";
import { applyDraft, draftOfText, fillGuessedLists } from "../src/recipeEdit";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { setLanguage } from "../src/i18n";
import type { StepState } from "../src/ui/useRecipeDraft";

const NOTE =
  "## Zutaten\n- 200 g Mehl\n- 1 Prise Salz\n\n## Schritte\n1. Mehl sieben.\n2. Salz zugeben.\n3. Ruhen lassen.\n";

function mount(steps: StepState[], baseExplicit = false) {
  setLanguage("de");
  const root = document.body.appendChild(document.createElement("div"));
  function Host() {
    const [s, set] = useState(steps);
    return h(EditSteps, { steps: s, baseExplicit, onChange: set, nextId: () => 9 });
  }
  render(h(Host, {}), root);
  const inputs = () => [...root.querySelectorAll<HTMLInputElement>(".rz-edit-karte label:last-child input")];
  const type = async (i: number, value: string) => {
    const el = inputs()[i];
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  };
  return {
    root,
    fields: () => inputs().map((i) => i.value),
    type,
    hint: () => root.querySelector(".rz-edit-hinweis")?.textContent,
  };
}

describe("the steps in the editor (ADR 0009)", () => {
  const steps: StepState[] = [
    { id: 1, title: "", text: "Mehl sieben.", ingredients: "" },
    { id: 2, title: "", text: "Salz zugeben.", ingredients: "" },
  ];
  it("only says what happens while typing: nothing is filled in", async () => {
    const m = mount(steps);
    expect(m.hint()).toContain("geraten");
    await m.type(1, "Mehl");
    expect(m.fields()).toEqual(["", "Mehl"]);
    expect(m.hint()).toContain("beim Speichern");
    await m.type(1, "");
    expect(m.hint()).toContain("geraten");
    render(null, m.root);
  });
  it("says that the lists hold for all steps in a note that has them", async () => {
    const m = mount(steps, true);
    await m.type(0, "Mehl");
    expect(m.hint()).toContain("für alle Schritte");
    render(null, m.root);
  });
});

describe("the draft of the editor", () => {
  const base = draftOfText(NOTE, DEFAULT_FORMAT.fields);
  const state = () =>
    stateOf(
      base,
      (() => {
        let n = 0;
        return () => ++n;
      })(),
    );
  it("keeps the draft as typed while typing and gives the other steps their guess on saving", () => {
    const s = state();
    s.steps[2].ingredients = "Mehl";
    const draft = draftOfState(s, base);
    expect(draft.steps.map((x) => x.ingredients ?? "")).toEqual(["", "", "Mehl"]);
    expect(fillGuessedLists(draft, base).steps.map((x) => x.ingredients)).toEqual(["Mehl", "Salz", "Mehl"]);
  });
  it("changes nothing when an entry was typed and deleted again", () => {
    const s = state();
    s.steps[2].ingredients = "Mehl";
    s.steps[2].ingredients = "";
    const draft = draftOfState(s, base);
    expect(draft.steps.map((x) => x.ingredients ?? "")).toEqual(["", "", ""]);
    const saved = fillGuessedLists(draft, base);
    const res = applyDraft(NOTE, base, saved, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    expect(res).toEqual({ ok: true, text: NOTE, parts: [] });
  });
  it("leaves a note that has lines, also only a 'none' line, to its own entries", () => {
    for (const line of ["Zutaten: Mehl", "Zutaten: keine"]) {
      const text = NOTE.replace("1. Mehl sieben.", `1. Mehl sieben.\n   - ${line}`);
      const b = draftOfText(text, DEFAULT_FORMAT.fields);
      expect(b.stepLists).toBe(true);
      const s = stateOf(
        b,
        (() => {
          let n = 0;
          return () => ++n;
        })(),
      );
      s.steps[2].ingredients = "Mehl";
      expect(fillGuessedLists(draftOfState(s, b), b).steps.map((x) => x.ingredients ?? "")[1]).toBe("");
    }
  });
});
