// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isInputField, keyForView } from "../src/ui/keyboard";

function layout(visible: boolean) {
  document.body.replaceChildren();
  const note = document.body.appendChild(document.createElement("div"));
  const editor = note.appendChild(document.createElement("div"));
  editor.setAttribute("contenteditable", "true");
  const root = document.body.appendChild(document.createElement("div"));
  const search = root.appendChild(document.createElement("input"));
  root.getClientRects = () => (visible ? [{}] : []) as unknown as DOMRectList;
  return { wurzel: root, editor, suche: search };
}

describe("Tastatur", () => {
  it("ignoriert Tasten im Editor einer normalen Notiz", () => {
    const { wurzel: root, editor } = layout(true);
    expect(keyForView(editor, root)).toBe(false);
  });

  it("nimmt Tasten aus der eigenen Ansicht", () => {
    const { wurzel: root, suche: search } = layout(true);
    expect(keyForView(search, root)).toBe(true);
  });

  it("nimmt Tasten ohne Fokus nur, wenn die Ansicht sichtbar ist", () => {
    expect(keyForView(document.body, layout(true).wurzel)).toBe(true);
    expect(keyForView(document.body, layout(false).wurzel)).toBe(false);
  });

  it("erkennt contenteditable als Eingabefeld", () => {
    const { editor, suche: search } = layout(true);
    expect(isInputField(editor)).toBe(true);
    expect(isInputField(search)).toBe(true);
    expect(isInputField(document.body)).toBe(false);
  });
});
