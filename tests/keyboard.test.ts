// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  dialogFor,
  escapeAction,
  escapeTarget,
  fieldHasText,
  isInputField,
  keyForView,
  type OpenLayers,
} from "../src/ui/keyboard";

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

  describe("escapeTarget", () => {
    const none: OpenLayers = {
      attempt: false,
      dialog: false,
      view: false,
      import: false,
      cooking: false,
      recipe: false,
    };
    it("does nothing when nothing is open", () => {
      expect(escapeTarget(none)).toBeNull();
    });
    it("closes the topmost layer first", () => {
      const all = { attempt: true, dialog: true, view: true, import: true, cooking: true, recipe: true };
      const seen: string[] = [];
      const open: OpenLayers = { ...all };
      for (let l = escapeTarget(open); l; l = escapeTarget(open)) {
        seen.push(l);
        open[l] = false;
      }
      expect(seen).toEqual(["attempt", "dialog", "view", "import", "cooking", "recipe"]);
    });
    it("closes a dialog before the recipe page", () => {
      expect(escapeTarget({ ...none, dialog: true, recipe: true })).toBe("dialog");
    });
  });

  describe("escapeAction", () => {
    const none: OpenLayers = {
      attempt: false,
      dialog: false,
      view: false,
      import: false,
      cooking: false,
      recipe: false,
    };
    it("closes the top layer", () => {
      expect(
        escapeAction({ open: { ...none, dialog: true, recipe: true }, fieldHasText: false, inSearch: false }),
      ).toBe("dialog");
    });
    it("leaves a field with text before closing the layer", () => {
      expect(escapeAction({ open: { ...none, attempt: true }, fieldHasText: true, inSearch: false })).toBe(
        "leave-field",
      );
    });
    it("clears the search when no layer is open", () => {
      expect(escapeAction({ open: none, fieldHasText: true, inSearch: true })).toBe("clear-search");
      expect(escapeAction({ open: none, fieldHasText: false, inSearch: true })).toBeNull();
      expect(escapeAction({ open: none, fieldHasText: true, inSearch: false })).toBeNull();
    });
  });

  it("detects text in fields", () => {
    const { suche: search, wurzel: root } = layout(true);
    expect(fieldHasText(search)).toBe(false);
    search.value = "x";
    expect(fieldHasText(search)).toBe(true);
    expect(fieldHasText(root)).toBe(false);
    expect(fieldHasText(null)).toBe(false);
  });

  describe("dialogFor", () => {
    it("shows the dialog only for the recipe it was opened for", () => {
      const d = { kind: "share" as const, path: "A.md" };
      expect(dialogFor(d, "A.md")).toBe("share");
      // reported bug: the dialog of recipe A showed up on recipe B
      expect(dialogFor(d, "B.md")).toBeNull();
      expect(dialogFor(d, null)).toBeNull();
      expect(dialogFor(null, "A.md")).toBeNull();
    });
  });
});
