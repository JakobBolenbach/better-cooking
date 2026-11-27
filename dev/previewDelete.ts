// "Delete recipe" of the preview without Obsidian: the same pure rules as src/deleteService.ts on the example notes.
// There are no older versions in the example notes, so ?versionen=n pretends n of them (default 2).
import { parseRecipe, todayIso } from "../src/parse";
import { entriesByDay, futurePlanEntries, linkOf, planLinkMatcher, translationsOf } from "../src/deletePlan";
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
  const nameOf = (path: string) => path.replace(/^.*\//, "").replace(/\.md$/, "");
  const scan = (path: string, withTranslations: boolean) => {
    const note = { path, name: nameOf(path) };
    const all = translationsOf(
      note,
      [...o.texts.keys()].map((p) => ({
        path: p,
        translationOf: linkOf(/^uebersetzung_von:\s*"?(.*?)"?$/m.exec(o.texts.get(p)!)?.[1]),
      })),
    );
    const going = [path, ...(withTranslations ? all : [])];
    const matches = planLinkMatcher(going.map((p) => ({ path: p, name: nameOf(p) })));
    return { note, all, going, rows: futurePlanEntries(o.plan(), todayIso(), matches), matches };
  };
  return {
    preview: async (path, translations) => {
      await new Promise((r) => setTimeout(r, 250));
      const s = scan(path, translations);
      const r = recipe(path);
      const others = [...o.texts.keys()].filter((p) => !s.going.includes(p)).map(recipe);
      const used = new Set(others.flatMap((x) => [x.image, x.timeline, ...x.images]));
      return {
        ok: true as const,
        title: r.title,
        images: [...new Set(s.going.flatMap((p) => [recipe(p).image, recipe(p).timeline, ...recipe(p).images]))].filter(
          (n): n is string => !!n && !used.has(n),
        ),
        backups: o.versions,
        translations: s.all.map((p) => ({ path: p, title: recipe(p).title, language: recipe(p).language })),
        plan: entriesByDay(s.rows).map((d) => ({ date: d.date, titles: d.targets })),
      };
    },
    run: async (path, opts) => {
      const s = scan(path, opts.translations);
      for (const p of s.going) o.texts.delete(p);
      o.setPlan(
        applyPlanEdit(o.plan(), { kind: "removeRecipe", from: todayIso(), matches: s.matches }, "Wochenplan", o.lang),
      );
      console.log("In den Papierkorb verschoben:", opts.title, `(+ ${s.going.length - 1} Dateien)`);
      o.done();
      return { ok: true };
    },
  };
}
