// What the view writes into recipe notes: frontmatter fields, "Made today" with its undo, attempts, opening a note.
// Split off src/view.ts; the view passes these to the UI (docs/architecture.md).
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { todayIso, insertAttempt } from "./parse";
import type { AttemptInput } from "./ui/attempt";
import { tr } from "./i18n";
import { markMade, undoMade, type MadeToken } from "./madeUndo";
import { keyFor, type FieldId } from "./noteFormat";

export class NoteActions {
  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private file(path: string): TFile | null {
    const d = this.app.vault.getAbstractFileByPath(path);
    return d instanceof TFile ? d : null;
  }

  /**
   * Change the frontmatter (Obsidian API, so order and formatting stay) and set the updated date.
   * `set` writes a field under the name the note already uses, otherwise under the configured one.
   */
  async fm(
    path: string,
    f: (fm: Record<string, unknown>, set: (id: FieldId, v: unknown) => void) => void,
    hint?: string,
  ) {
    const d = this.file(path);
    if (!d) return;
    const fields = this.plugin.noteFormat().fields;
    try {
      await this.app.fileManager.processFrontMatter(d, (fm: Record<string, unknown>) => {
        const set = (id: FieldId, v: unknown) => {
          fm[keyFor(fm, fields, id)] = v;
        };
        f(fm, set);
        set("updated", todayIso());
      });
      if (hint) new Notice(hint);
    } catch (e) {
      new Notice(tr("changeFailed", { file: d.basename, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  /** What the last "Made today" per note wrote, for Undo (see src/madeUndo.ts). */
  private madeTokens = new Map<string, MadeToken>();

  async madeToday(path: string) {
    const d = this.file(path);
    if (!d) return;
    const fields = this.plugin.noteFormat().fields;
    try {
      await this.app.fileManager.processFrontMatter(d, (fm: Record<string, unknown>) => {
        this.madeTokens.set(path, markMade(fm, fields, todayIso()));
      });
      new Notice(tr("madeTodaySaved"));
    } catch (e) {
      new Notice(tr("changeFailed", { file: d.basename, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  async undoMadeToday(path: string) {
    const d = this.file(path);
    const token = this.madeTokens.get(path);
    if (!d || !token) return;
    this.madeTokens.delete(path);
    try {
      let undone = false;
      await this.app.fileManager.processFrontMatter(d, (fm: Record<string, unknown>) => {
        undone = undoMade(fm, token);
      });
      new Notice(undone ? tr("madeUndone") : tr("undoStale"));
    } catch (e) {
      new Notice(tr("changeFailed", { file: d.basename, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  async attempt(path: string, v: AttemptInput): Promise<boolean> {
    const d = this.file(path);
    if (!d) return false;
    try {
      await this.app.vault.process(d, (text) =>
        insertAttempt(
          text,
          {
            date: v.date.trim(),
            modified: v.modified,
            result: v.result,
            rating: v.rating,
          },
          this.plugin.noteFormat().lang,
        ),
      );
      await this.fm(path, (_fm, set) => {
        if (v.made) set("lastMade", v.iso);
        if (v.asRating && v.rating) set("rating", v.rating);
      });
      new Notice(tr("attemptSaved"));
      return true;
    } catch (e) {
      new Notice(tr("attemptFailed", { error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }

  async openNote(path: string) {
    const d = this.file(path);
    if (d) await this.app.workspace.getLeaf("tab").openFile(d);
  }
}
