// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { EditSteps } from "../src/ui/editSteps";
import { setLanguage } from "../src/i18n";
import type { StepState } from "../src/ui/useRecipeDraft";

function mount(steps: StepState[]) {
  setLanguage("de");
  const root = document.body.appendChild(document.createElement("div"));
  const groups = [{ id: 1, title: "", text: "200 g Mehl\n1 Prise Salz" }];
  function Host() {
    const [s, set] = useState(steps);
    return h(EditSteps, { steps: s, groups, onChange: set, nextId: () => 9 });
  }
  render(h(Host, {}), root);
  const fields = () =>
    [...root.querySelectorAll<HTMLInputElement>(".rz-edit-karte label:last-child input")].map((i) => i.value);
  const type = async (i: number, value: string) => {
    const el = root.querySelectorAll<HTMLInputElement>(".rz-edit-karte label:last-child input")[i];
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  const hint = () => root.querySelector(".rz-edit-hinweis")?.textContent;
  return { root, fields, type, hint };
}

describe("the steps in the editor (ADR 0009)", () => {
  const steps: StepState[] = [
    { id: 1, title: "", text: "Mehl sieben.", ingredients: "" },
    { id: 2, title: "", text: "Salz zugeben.", ingredients: "" },
    { id: 3, title: "", text: "Ruhen lassen.", ingredients: "" },
  ];
  it("keeps the guess for the other steps when the first list is typed, and says that the list holds for all", async () => {
    const m = mount(steps);
    expect(m.hint()).toContain("geraten");
    await m.type(2, "Mehl");
    expect(m.fields()).toEqual(
      ["Mehl", "Salz", "Mehl"].map((x, i) => (i === 2 ? "Mehl" : x)).map((x, i) => (i === 0 ? "Mehl" : x)),
    );
    expect(m.hint()).toContain("für alle Schritte");
    render(null, m.root);
  });
});
