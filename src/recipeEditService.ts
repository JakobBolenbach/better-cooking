// The recipe editor (issue #131) inside Obsidian: opens a note for editing, saves the draft with compare and set in one
// `vault.process` (the pure rules are in src/recipeEdit.ts) and takes a save back with "Undo". The undo token (the note
// before and exactly what the save wrote) is kept in memory per note: Undo works only while the note still is exactly
// what the save wrote; nothing is stored.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { noticeWithAction } from "./notice";
import { applyDraft, draftOfText, undoEdit, type EditPart, type EditToken, type RecipeDraft } from "./recipeEdit";
import { todayIso } from "./parse";
import { tr, type Key } from "./i18n";
import type { EditApi, SaveResult } from "./ui/recipeEditor";

const PART_LABEL: Record<EditPart, Key> = {
  title: "editPartTitle",
  yield: "editPartYield",
  times: "editPartTimes",
  category: "editPartCategory",
  ingredients: "editPartIngredients",
  steps: "editPartSteps",
  tips: "editPartTips",
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Thrown inside `vault.process` to leave the note as it is. */
class Stop extends Error {
  constructor(readonly result: SaveResult) {
    super("stop");
  }
}

export class RecipeEditor {
  /** What the last save per note wrote, for Undo. */
  private tokens = new Map<string, EditToken>();

  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  api(): EditApi {
    return { open: (path) => this.open(path), save: (path, base, draft) => this.save(path, base, draft) };
  }

  /** The note as the editor starts with it. */
  async open(path: string): Promise<{ ok: true; base: RecipeDraft } | { ok: false; message: string }> {
    const file = this.file(path);
    if (!file) return { ok: false, message: tr("editGone") };
    try {
      return { ok: true, base: draftOfText(await this.app.vault.read(file), this.plugin.noteFormat().fields) };
    } catch (e) {
      return { ok: false, message: tr("editFailed", { error: errorText(e).slice(0, 120) }) };
    }
  }

  /** Writes the changed parts; a part that changed since `base` stops the save (nothing is written). */
  async save(path: string, base: RecipeDraft, draft: RecipeDraft): Promise<SaveResult> {
    const file = this.file(path);
    if (!file) return { ok: false, conflict: false, message: tr("editGone") };
    const format = this.plugin.noteFormat();
    try {
      let token: EditToken | undefined;
      let parts: EditPart[] = [];
      await this.app.vault.process(file, (text) => {
        const r = applyDraft(text, base, draft, { format, today: todayIso() });
        if (!r.ok)
          throw new Stop({
            ok: false,
            conflict: r.conflict,
            message: r.conflict ? tr("editConflict") : "",
            issues: r.issues,
          });
        parts = r.parts;
        if (r.text !== text) token = { before: text, after: r.text };
        return r.text;
      });
      if (token) {
        this.tokens.set(path, token);
        noticeWithAction(
          tr("editSaved", { parts: parts.map((p) => tr(PART_LABEL[p])).join(", ") }),
          { label: tr("undo"), run: () => void this.undo(path) },
          10_000,
        );
      }
      return { ok: true, parts };
    } catch (e) {
      if (e instanceof Stop) return e.result;
      return { ok: false, conflict: false, message: tr("editFailed", { error: errorText(e).slice(0, 120) }) };
    }
  }

  /** Takes the last save of the note back, but only while the note is exactly what that save wrote. */
  async undo(path: string): Promise<void> {
    const file = this.file(path);
    const token = this.tokens.get(path);
    if (!file || !token) return;
    this.tokens.delete(path);
    try {
      let undone = false;
      await this.app.vault.process(file, (text) => {
        const before = undoEdit(text, token);
        undone = before !== undefined;
        return before ?? text;
      });
      new Notice(tr(undone ? "editUndone" : "undoStale"));
    } catch (e) {
      new Notice(tr("changeFailed", { file: file.basename, error: errorText(e).slice(0, 120) }));
    }
  }
}
