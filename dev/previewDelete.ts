// "Delete recipe" of the preview without Obsidian: the same pure `planDelete` and `deletable` as src/deleteService.ts on
// the example notes. Links are resolved by file name, the images lie in `Recipes/Bilder/`, and ?versionen=n pretends n
// older versions per recipe (default 2) in `Recipes/Vorversionen/`.
import { noteName, parseRecipe, todayIso } from "../src/parse";
import { deletable, entriesByDay, planDelete } from "../src/deletePlan";
import { applyPlanEdit } from "../src/planEdit";
import { linkValue } from "../src/translations";
import type { DeleteApi } from "../src/ui/deleteModal";
import type { Lang } from "../src/i18n";

const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;

export function previewDelete(o: {
  texts: Map<string, string>;
  plan: () => string;
  setPlan: (text: string) => void;
  versions: number;
  lang: Lang;
  done: () => void;
}): DeleteApi {
  const recipe = (path: string) => parseRecipe(path, o.texts.get(path)!);
  const resolve = (target: string) =>
    IMAGE.test(target) ? `Recipes/Bilder/${target}` : [...o.texts.keys()].find((p) => noteName(p) === noteName(target));
  const scan = (path: string, withTranslations: boolean) => {
    const resolvedLinks: Record<string, Record<string, number>> = {};
    for (const [p, text] of o.texts) {
      resolvedLinks[p] = {};
      for (const m of text.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) {
        const to = resolve(m[1].trim());
        if (to) resolvedLinks[p][to] = (resolvedLinks[p][to] ?? 0) + 1;
      }
    }
    return planDelete({
      recipe: { path, name: noteName(path) },
      withTranslations,
      folder: "Recipes",
      today: todayIso(),
      recipes: [...o.texts.keys()].map((p) => ({
        path: p,
        name: noteName(p),
        link: linkValue(/^uebersetzung_von:\s*(.*)$/m.exec(o.texts.get(p)!)?.[1].replace(/^"|"$/g, "")),
      })),
      versions: [...o.texts.keys()]
        .filter((p) => !o.texts.get(p)!.includes("uebersetzung_von"))
        .flatMap((p) =>
          Array.from({ length: o.versions }, (_, i) => ({
            path: `Recipes/Vorversionen/${noteName(p)} (Vorversion 2026-01-0${i + 1}).md`,
            link: noteName(p),
          })),
        ),
      resolve: (target, from) => (from.startsWith("Recipes/Vorversionen/") ? `Recipes/${target}.md` : resolve(target)),
      resolvedLinks,
      linksSure: true,
      planText: o.plan(),
      planResolve: resolve,
    });
  };
  return {
    preview: async (path, translations) => {
      await new Promise((r) => setTimeout(r, 250));
      const s = scan(path, translations);
      return {
        ok: true as const,
        title: recipe(path).title,
        images: s.images.map((i) => noteName(i)),
        imagesKept: false,
        incomplete: false,
        backups: s.backups.length,
        translations: s.allTranslations.map((p) => ({ path: p, title: recipe(p).title, language: recipe(p).language })),
        plan: entriesByDay(s.rows).map((d) => ({ date: d.date, titles: d.targets.map((t) => noteName(t)) })),
        shown: { files: [...s.translations, ...s.backups, ...s.images], targets: s.targets },
      };
    },
    run: async (path, opts) => {
      const { files, targets } = deletable(scan(path, opts.translations), opts.shown);
      const deleted = [path, ...files.filter((f) => o.texts.has(f))];
      for (const p of deleted) o.texts.delete(p);
      o.setPlan(
        applyPlanEdit(
          o.plan(),
          { kind: "removeRecipe", from: todayIso(), matches: (t) => targets.has(t) },
          "Wochenplan",
          o.lang,
        ),
      );
      console.log("Gelöscht:", opts.title);
      o.done();
      return { ok: true, deleted };
    },
  };
}
