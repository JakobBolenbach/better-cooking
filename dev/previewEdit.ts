// The recipe editor of the preview without Obsidian: the real `applyDraft` of src/recipeEdit.ts on the example notes.
// ?konflikt=1 pretends another device changed the note: the first save answers "changed on another device".
import { applyDraft, draftChanges, draftOfText } from "../src/recipeEdit";
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
        : { ok: true, base: draftOfText(text, format.fields, path) };
    },
    save: async (path, base, draft) => {
      await new Promise((r) => setTimeout(r, 250));
      if (pretend) {
        pretend = false;
        const current = draftOfText(o.texts.get(path) ?? "", format.fields, path);
        return {
          ok: false,
          conflict: true,
          message: tr("editConflict"),
          parts: draftChanges(base, draft),
          base: current,
        };
      }
      const r = applyDraft(o.texts.get(path) ?? "", base, draft, { format, today: todayIso(), path });
      if (!r.ok)
        return r.conflict
          ? { ok: false, conflict: true, message: tr("editConflict"), parts: r.parts, base: r.base }
          : { ok: false, conflict: false, message: "", issues: r.issues };
      o.texts.set(path, r.text);
      o.done();
      return { ok: true, parts: r.parts };
    },
  };
}
