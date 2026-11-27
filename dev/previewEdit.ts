// The recipe editor of the preview without Obsidian: the real `applyDraft` of src/recipeEdit.ts on the example notes.
// ?konflikt=1 pretends another device changed the note: the first save answers "changed on another device".
import { applyDraft, draftOfText } from "../src/recipeEdit";
import { makeNoteFormat } from "../src/noteFormat";
import { todayIso } from "../src/parse";
import { tr, type Lang } from "../src/i18n";
import type { EditApi } from "../src/ui/recipeEditor";

export function previewEdit(o: {
  texts: Map<string, string>;
  lang: Lang;
  conflict: boolean;
  done: () => void;
}): EditApi {
  const format = makeNoteFormat(o.lang).format;
  let pretend = o.conflict;
  return {
    open: async (path) => {
      await new Promise((r) => setTimeout(r, 150));
      const text = o.texts.get(path);
      return text === undefined
        ? { ok: false, message: tr("editGone") }
        : { ok: true, base: draftOfText(text, format.fields) };
    },
    save: async (path, base, draft) => {
      await new Promise((r) => setTimeout(r, 250));
      if (pretend) {
        pretend = false;
        return { ok: false, conflict: true, message: tr("editConflict") };
      }
      const r = applyDraft(o.texts.get(path) ?? "", base, draft, { format, today: todayIso() });
      if (!r.ok) return { ok: false, conflict: r.conflict, message: r.conflict ? tr("editConflict") : "" };
      o.texts.set(path, r.text);
      o.done();
      return { ok: true, parts: r.parts };
    },
  };
}
