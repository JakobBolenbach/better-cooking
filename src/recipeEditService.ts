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
  servings: "editPartServings",
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
      const text = await this.app.vault.read(file);
      return { ok: true, base: draftOfText(text, this.plugin.noteFormat().fields, file.path) };
    } catch (e) {
      return { ok: false, message: tr("editLoadFailed", { error: errorText(e).slice(0, 120) }) };
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
        const r = applyDraft(text, base, draft, { format, today: todayIso(), path: file.path });
        if (!r.ok)
          throw new Stop(
            r.conflict
              ? { ok: false, conflict: true, message: tr("editConflict"), parts: r.parts, base: r.base }
              : { ok: false, conflict: false, message: tr("editIssueFormat"), issues: r.issues },
          );
        parts = r.parts;
        if (r.text !== text) token = { before: text, after: r.text };
        return r.text;
      });
      if (token) {
        // The token lives in the notice's button only: it is gone with the notice.
        const saved = token;
        noticeWithAction(
          tr("editSaved", { parts: parts.map((p) => tr(PART_LABEL[p])).join(", ") }),
          { label: tr("undo"), run: () => void this.undo(file, saved) },
          10_000,
        );
      }
      return { ok: true, parts };
    } catch (e) {
      if (e instanceof Stop) return e.result;
      return { ok: false, conflict: false, message: tr("editFailed", { error: errorText(e).slice(0, 120) }) };
    }
  }

  /** Takes a save back, but only while its note is exactly what that save wrote. */
  async undo(file: TFile, token: EditToken): Promise<void> {
    // The note was deleted or moved out of the vault meanwhile; a rename keeps the same file object.
    if (this.app.vault.getAbstractFileByPath(file.path) !== file) return void new Notice(tr("editUndoGone"));
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
