// "Delete recipe" of the preview without Obsidian: the same pure `planDelete` as src/deleteService.ts on the example notes.
// There are no older versions in the example notes, so ?versionen=n pretends n of them (default 2).
import { parseRecipe, noteName, todayIso } from "../src/parse";
import { entriesByDay, planDelete } from "../src/deletePlan";
import { applyPlanEdit } from "../src/planEdit";
import type { DeleteApi } from "../src/ui/deleteModal";
import type { Lang } from "../src/i18n";

export function previewDelete(o: {
  texts: Map<string, string>;
  plan: () => string;
  setPlan: (text: string) => void;
  versions: number;
  lang: Lang;
  done: () => void;
}): DeleteApi {
  const recipe = (path: string) => parseRecipe(path, o.texts.get(path)!);
  const scan = (path: string, withTranslations: boolean) =>
    planDelete({
      recipe: { path, name: noteName(path) },
      withTranslations,
      folder: "Recipes",
      today: todayIso(),
      recipes: [...o.texts.keys()].map((p) => ({
        path: p,
        name: noteName(p),
        link: /^uebersetzung_von:\s*"?(.*?)"?$/m.exec(o.texts.get(p)!)?.[1],
      })),
      // The pretend versions have names but no files; they are counted below.
      versions: [],
      resolvedLinks: {},
      linksSure: true,
      planText: o.plan(),
    });
  return {
    preview: async (path, translations) => {
      await new Promise((r) => setTimeout(r, 250));
      const s = scan(path, translations);
      const going = [path, ...s.translations];
      const used = new Set(
        [...o.texts.keys()]
          .filter((p) => !going.includes(p))
          .flatMap((p) => [recipe(p).image, recipe(p).timeline, ...recipe(p).images]),
      );
      const images = [
        ...new Set(going.flatMap((p) => [recipe(p).image, recipe(p).timeline, ...recipe(p).images])),
      ].filter((n): n is string => !!n && !used.has(n));
      return {
        ok: true as const,
        title: recipe(path).title,
        images,
        imagesKept: false,
        backups: o.versions,
        translations: s.allTranslations.map((p) => ({ path: p, title: recipe(p).title, language: recipe(p).language })),
        plan: entriesByDay(s.rows).map((d) => ({ date: d.date, titles: d.targets })),
        shown: { files: s.translations, targets: s.targets },
      };
    },
    run: async (path, opts) => {
      const s = scan(path, opts.translations);
      const hit = new Set(s.targets.filter((t) => opts.shown.targets.includes(t)));
      for (const p of [path, ...s.translations.filter((x) => opts.shown.files.includes(x))]) o.texts.delete(p);
      o.setPlan(
        applyPlanEdit(
          o.plan(),
          { kind: "removeRecipe", from: todayIso(), matches: (t) => hit.has(t) },
          "Wochenplan",
          o.lang,
        ),
      );
      console.log("Gelöscht:", opts.title);
      o.done();
      return { ok: true };
    },
  };
}
