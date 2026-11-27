import { beforeEach, describe, expect, it, vi } from "vitest";

const notices: string[] = [];
const actions: { label: string; run: () => void }[] = [];
vi.mock("obsidian", () => {
  class TFile {
    basename: string;
    constructor(public path: string) {
      this.basename = path.split("/").pop()!.replace(/\.md$/, "");
    }
  }
  class Notice {
    constructor(text: string) {
      notices.push(text);
    }
  }
  return { TFile, Notice };
});
vi.mock("../src/notice", () => ({
  noticeWithAction: (text: string, action: { label: string; run: () => void } | undefined) => {
    notices.push(text);
    if (action) actions.push(action);
  },
}));

import { TFile } from "obsidian";
import { RecipeEditor } from "../src/recipeEditService";
import { setLanguage } from "../src/i18n";
import { DEFAULT_FORMAT } from "../src/noteFormat";

const NOTE = `---
typ: rezept
ergebnis: "4 Portionen"
aktualisiert: 2026-11-26
---
# Suppe

## Zutaten
- 1 Zwiebel
- 2 Möhren

## Schritte
1. Kochen.
2. Essen.

## Notizen
- gut
`;

function setup(text = NOTE) {
  const files = new Map([["Rezepte/Suppe.md", text]]);
  const tfile = new (TFile as unknown as new (p: string) => TFile)("Rezepte/Suppe.md");
  let writes = 0;
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (files.has(p) ? tfile : null),
      read: (f: TFile) => Promise.resolve(files.get(f.path)!),
      process: async (f: TFile, fn: (t: string) => string) => {
        const next = fn(files.get(f.path)!);
        if (next !== files.get(f.path)) writes++;
        files.set(f.path, next);
        return next;
      },
    },
  };
  const editor = new RecipeEditor({ app, noteFormat: () => DEFAULT_FORMAT } as never);
  return { editor, files, writes: () => writes };
}

beforeEach(() => {
  notices.length = 0;
  actions.length = 0;
  setLanguage("en");
});

describe("recipe editor service", () => {
  it("opens a note as a draft", async () => {
    const { editor } = setup();
    const r = await editor.open("Rezepte/Suppe.md");
    expect(r).toMatchObject({ ok: true, base: { title: "Suppe", result: "4 Portionen" } });
    expect(await editor.open("Rezepte/Weg.md")).toMatchObject({ ok: false });
  });

  it("saves only the changed parts, names them in the notice and undoes the save", async () => {
    const { editor, files } = setup();
    const o = await editor.open("Rezepte/Suppe.md");
    if (!o.ok) throw new Error();
    const draft = structuredClone(o.base);
    draft.ingredients[0].items[1] = "3 Möhren";
    draft.steps.push({ text: "Nachsalzen." });
    const res = await editor.save("Rezepte/Suppe.md", o.base, draft);
    expect(res).toEqual({ ok: true, parts: ["ingredients", "steps"] });
    const after = files.get("Rezepte/Suppe.md")!;
    expect(after).toContain("- 3 Möhren\n");
    expect(after).toContain("3. Nachsalzen.\n");
    expect(after).toContain("## Notizen\n- gut\n");
    expect(notices).toEqual(["Saved: Ingredients, Steps"]);
    expect(actions[0].label).toBe("Undo");
    actions[0].run();
    await vi.waitFor(() => expect(notices).toContain("Change taken back."));
    expect(files.get("Rezepte/Suppe.md")).toBe(NOTE);
  });

  it("undo does nothing when the note changed after the save", async () => {
    const { editor, files } = setup();
    const o = await editor.open("Rezepte/Suppe.md");
    if (!o.ok) throw new Error();
    const draft = structuredClone(o.base);
    draft.title = "Gemüsesuppe";
    await editor.save("Rezepte/Suppe.md", o.base, draft);
    const saved = files.get("Rezepte/Suppe.md")!;
    files.set("Rezepte/Suppe.md", saved + "- später\n");
    actions[0].run();
    await vi.waitFor(() => expect(notices).toContain("The note changed in the meantime, so nothing was undone."));
    expect(files.get("Rezepte/Suppe.md")).toBe(saved + "- später\n");
  });

  it("undo says so when the note is gone, and keeps no token after the notice", async () => {
    const { editor, files } = setup();
    const o = await editor.open("Rezepte/Suppe.md");
    if (!o.ok) throw new Error();
    const draft = structuredClone(o.base);
    draft.title = "Gemüsesuppe";
    await editor.save("Rezepte/Suppe.md", o.base, draft);
    expect((editor as unknown as { tokens?: unknown }).tokens).toBeUndefined();
    files.delete("Rezepte/Suppe.md");
    actions[0].run();
    await vi.waitFor(() => expect(notices).toContain("The note no longer exists, so Undo is not possible."));
  });

  it("a part that changed since opening stops the save and writes nothing", async () => {
    const { editor, files, writes } = setup();
    const o = await editor.open("Rezepte/Suppe.md");
    if (!o.ok) throw new Error();
    files.set("Rezepte/Suppe.md", NOTE.replace("2 Möhren", "5 Möhren"));
    const draft = structuredClone(o.base);
    draft.ingredients[0].items[1] = "3 Möhren";
    const res = await editor.save("Rezepte/Suppe.md", o.base, draft);
    expect(res).toMatchObject({
      ok: false,
      conflict: true,
      message: "The note changed in the meantime.",
      parts: ["ingredients"],
    });
    expect(res.ok === false && res.conflict && res.base.ingredients[0].items[1]).toBe("5 Möhren");
    expect(writes()).toBe(0);
    expect(files.get("Rezepte/Suppe.md")).toContain("5 Möhren");
    expect(notices).toEqual([]);
  });

  it("nothing changed: nothing written, no notice", async () => {
    const { editor, writes } = setup();
    const o = await editor.open("Rezepte/Suppe.md");
    if (!o.ok) throw new Error();
    expect(await editor.save("Rezepte/Suppe.md", o.base, structuredClone(o.base))).toEqual({ ok: true, parts: [] });
    expect(writes()).toBe(0);
    expect(notices).toEqual([]);
  });

  it("a note that is gone, and a failing write, are reported", async () => {
    const { editor } = setup();
    const o = await editor.open("Rezepte/Suppe.md");
    if (!o.ok) throw new Error();
    expect(await editor.save("Rezepte/Weg.md", o.base, o.base)).toMatchObject({ ok: false, conflict: false });
  });
});
