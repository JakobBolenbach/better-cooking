// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  dialogFor,
  escapeAction,
  escapeTarget,
  escapeHandling,
  fieldChanged,
  isTextField,
  slashAllowed,
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
      page: false,
      planDialog: false,
      undo: false,
      ask: false,
      details: false,
    };
    it("does nothing when nothing is open", () => {
      expect(escapeTarget(none)).toBeNull();
    });
    it("closes the topmost layer first", () => {
      const all = {
        attempt: true,
        dialog: true,
        view: true,
        import: true,
        cooking: true,
        recipe: true,
        ask: true,
        details: true,
        planDialog: true,
        undo: true,
        page: true,
      };
      const seen: string[] = [];
      const open: OpenLayers = { ...all };
      for (let l = escapeTarget(open); l; l = escapeTarget(open)) {
        seen.push(l);
        open[l] = false;
      }
      expect(seen).toEqual([
        "attempt",
        "dialog",
        "view",
        "import",
        "cooking",
        "recipe",
        "ask",
        "details",
        "planDialog",
        "undo",
        "page",
      ]);
    });
    it("closes the recipe page before the page below it", () => {
      expect(escapeTarget({ ...none, recipe: true, page: true })).toBe("recipe");
      expect(escapeTarget({ ...none, page: true })).toBe("page");
    });
    it("closes the question, then the opened item, then the page", () => {
      expect(escapeTarget({ ...none, page: true, details: true, ask: true })).toBe("ask");
      expect(escapeTarget({ ...none, page: true, details: true })).toBe("details");
      expect(escapeTarget({ ...none, page: true })).toBe("page");
    });
    it("closes the meal plan dialog right above its page, below the recipe", () => {
      expect(escapeTarget({ ...none, page: true, planDialog: true })).toBe("planDialog");
      expect(escapeTarget({ ...none, page: true, planDialog: true, recipe: true })).toBe("recipe");
    });
    it("closes the bar for putting an entry back after the meal plan dialog, before the page", () => {
      expect(escapeTarget({ ...none, page: true, undo: true, planDialog: true })).toBe("planDialog");
      expect(escapeTarget({ ...none, page: true, undo: true })).toBe("undo");
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
      page: false,
      planDialog: false,
      undo: false,
      ask: false,
      details: false,
    };
    const idle = { fieldChanged: false, inSearch: false, searchHasText: false };
    it("closes the top layer", () => {
      expect(escapeAction({ open: { ...none, dialog: true, recipe: true }, ...idle })).toBe("dialog");
    });
    it("leaves a changed field before closing the layer", () => {
      expect(escapeAction({ open: { ...none, attempt: true }, ...idle, fieldChanged: true })).toBe("leave-field");
    });
    it("closes at once when the field was not changed", () => {
      expect(escapeAction({ open: { ...none, attempt: true }, ...idle })).toBe("attempt");
    });
    it("on a page: a typed field is left first, then the question, the item and the page close", () => {
      const page = { ...none, page: true };
      expect(escapeAction({ open: page, ...idle, fieldChanged: true })).toBe("leave-field");
      expect(escapeAction({ open: page, ...idle })).toBe("page");
      expect(escapeAction({ open: { ...page, details: true }, ...idle })).toBe("details");
      expect(escapeAction({ open: { ...page, details: true, ask: true }, ...idle })).toBe("ask");
    });
    it("clears the search when no layer is open", () => {
      expect(escapeAction({ open: none, ...idle, inSearch: true, searchHasText: true })).toBe("clear-search");
      expect(escapeAction({ open: none, ...idle, inSearch: true })).toBeNull();
      expect(escapeAction({ open: none, ...idle, searchHasText: true })).toBeNull();
    });
  });

  describe("fields", () => {
    const field = (tag: string, attrs: Record<string, string> = {}) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.body.replaceChildren(el);
      return el;
    };
    it("knows text fields", () => {
      expect(isTextField(field("textarea"))).toBe(true);
      expect(isTextField(field("input", { type: "date" }))).toBe(true);
      expect(isTextField(field("input"))).toBe(true);
      expect(isTextField(field("input", { type: "checkbox" }))).toBe(false);
      expect(isTextField(field("button"))).toBe(false);
      expect(isTextField(null)).toBe(false);
    });
    it("counts only fields the user edited and that still have content", () => {
      const edited = new WeakSet<Element>();
      const input = field("input", { value: "2026-11-26" }) as HTMLInputElement;
      expect(fieldChanged(input, edited)).toBe(false); // prefilled
      edited.add(input);
      expect(fieldChanged(input, edited)).toBe(true);
      input.value = "";
      expect(fieldChanged(input, edited)).toBe(false); // emptied again
      const box = field("input", { type: "checkbox", checked: "" });
      edited.add(box);
      expect(fieldChanged(box, edited)).toBe(false);
    });
  });

  describe("slashAllowed", () => {
    const none: OpenLayers = {
      attempt: false,
      dialog: false,
      view: false,
      import: false,
      cooking: false,
      recipe: false,
      page: false,
      planDialog: false,
      undo: false,
      ask: false,
      details: false,
    };
    it("allows / on a page with its question or opened item open", () => {
      expect(slashAllowed({ ...none, page: true, ask: true, details: true })).toBe(true);
    });
    it("allows / on the overview, a page and the recipe page only", () => {
      expect(slashAllowed(none)).toBe(true);
      expect(slashAllowed({ ...none, page: true })).toBe(true);
      expect(slashAllowed({ ...none, recipe: true })).toBe(true);
      expect(slashAllowed({ ...none, recipe: true, dialog: true })).toBe(false);
      expect(slashAllowed({ ...none, recipe: true, cooking: true })).toBe(false);
      expect(slashAllowed({ ...none, import: true })).toBe(false);
    });
  });

  describe("escapeHandling", () => {
    const plain = { inView: true, ctrl: false, meta: false, alt: false, shift: false };
    it("takes a plain Esc in the view, also when nothing closes", () => {
      expect(escapeHandling(plain)).toBe("ours");
    });
    it("passes Esc with a modifier or outside the view to Obsidian", () => {
      expect(escapeHandling({ ...plain, ctrl: true })).toBe("pass");
      expect(escapeHandling({ ...plain, shift: true })).toBe("pass");
      expect(escapeHandling({ ...plain, inView: false })).toBe("pass");
    });
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
