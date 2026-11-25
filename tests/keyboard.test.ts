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

describe("keyboard", () => {
  it("ignores keys in the editor of an ordinary note", () => {
    const { wurzel: root, editor } = layout(true);
    expect(keyForView(editor, root)).toBe(false);
  });

  it("takes keys from its own view", () => {
    const { wurzel: root, suche: search } = layout(true);
    expect(keyForView(search, root)).toBe(true);
  });

  it("takes keys without focus only when the view is visible", () => {
    expect(keyForView(document.body, layout(true).wurzel)).toBe(true);
    expect(keyForView(document.body, layout(false).wurzel)).toBe(false);
  });

  it("treats contenteditable as an input field", () => {
    const { editor, suche: search } = layout(true);
    expect(isInputField(editor)).toBe(true);
    expect(isInputField(search)).toBe(true);
    expect(isInputField(document.body)).toBe(false);
  });
});
