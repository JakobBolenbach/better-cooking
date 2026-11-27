// What the recipe editor (src/ui/recipeEditor.tsx) and the host (the plugin, the preview) say to each other (issue #131).
import type { EditPart, Issue, RecipeDraft } from "../recipeEdit";

export type SaveResult =
  | { ok: true; parts: EditPart[] }
  /** The note changed meanwhile in `parts` (which the user changed too); `base` is the note as it is now. */
  | { ok: false; conflict: true; message: string; parts: EditPart[]; base: RecipeDraft }
  | { ok: false; conflict: false; message: string; issues?: Issue[] };

/** What the host offers for editing. */
export interface EditApi {
  open: (path: string) => Promise<{ ok: true; base: RecipeDraft } | { ok: false; message: string }>;
  save: (path: string, base: RecipeDraft, draft: RecipeDraft) => Promise<SaveResult>;
}

/** What a save changed that matters outside the editor: the remembered step of cooking mode no longer fits. */
export interface Saved {
  /** The steps are not the same in the same order any more (count, text or order). */
  stepsChanged: boolean;
}
