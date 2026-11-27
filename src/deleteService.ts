// "Delete recipe" (issue #119) inside Obsidian: reads what belongs to a recipe (`planDelete`, src/deletePlan.ts),
// tells the dialog, and on confirmation deletes it all with `fileManager.trashFile`, so Obsidian's setting decides
// whether it goes to the trash. Only what the dialog showed is deleted: `run` gets the paths and plan links of the
// preview and takes the intersection with what it reads again (like src/failureService.ts). Order: the recipe note
// first (if that fails nothing else happens), then translations, older versions and images no kept note links to, then
// the entries of the meal plan. If a later step fails, the notice names what is left.
// The remembered cover address and the amounts per recipe on the shopping list go through the delete events of
// src/main.ts and src/listNotes.ts.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { canvasLinks, entriesByDay, planDelete, type DeletePreview, type DeleteScan, type Shown } from "./deletePlan";
import { BACKUP_FOLDER, isRecipeFile, joinPath } from "./folder";
import { readField } from "./noteFormat";
import { noteName, todayIso } from "./parse";
import { tr } from "./i18n";

export type DeleteResult = { ok: boolean; message?: string };

interface Scan {
  file: TFile;
  title: string;
  found: DeleteScan;
  titles: Map<string, string>;
  languages: Map<string, string>;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const text = (v: unknown) => (typeof v === "string" ? v : undefined);

export class RecipeDeleter {
  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  private frontmatter(f: TFile): Record<string, unknown> {
    return this.app.metadataCache.getFileCache(f)?.frontmatter ?? {};
  }

  private titleOf(f: TFile): string {
    return this.app.metadataCache.getFileCache(f)?.headings?.find((h) => h.level === 1)?.heading ?? f.basename;
  }

  /** The links of the notes and, for the canvases, their file nodes; `sure` is false while Obsidian still indexes or when a canvas cannot be read. */
  private async links(): Promise<{ links: Record<string, Record<string, number>>; sure: boolean }> {
    const links = { ...this.app.metadataCache.resolvedLinks };
    let sure = this.plugin.linksReady;
    for (const f of this.app.vault.getFiles().filter((x) => x.extension === "canvas")) {
      try {
        const found = canvasLinks(await this.app.vault.cachedRead(f));
        if (found) links[f.path] = found;
        else sure = false;
      } catch {
        sure = false;
      }
    }
    return { links, sure };
  }

  private async scan(path: string, withTranslations: boolean): Promise<Scan | string> {
    const { folder } = this.plugin.settings;
    const file = this.file(path);
    if (!file) return tr("deleteGone");
    if (!isRecipeFile(path, folder) || this.plugin.lists.isListNote(path)) return tr("deleteNotRecipe");
    const fields = this.plugin.noteFormat().fields;
    const cache = this.app.metadataCache;
    const planPath = this.plugin.lists.mealPlanPath();
    const recipeFiles = this.app.vault
      .getMarkdownFiles()
      .filter((f) => isRecipeFile(f.path, folder) && !this.plugin.lists.isListNote(f.path));
    const backupDir = `${joinPath(folder, BACKUP_FOLDER)}/`;
    const { links, sure } = await this.links();
    const found = planDelete({
      recipe: { path, name: file.basename },
      withTranslations,
      folder,
      today: todayIso(),
      recipes: recipeFiles.map((f) => ({
        path: f.path,
        name: f.basename,
        link: text(readField(this.frontmatter(f), fields, "translationOf")),
      })),
      versions: this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(backupDir))
        .map((f) => {
          const fm = this.frontmatter(f);
          return { path: f.path, link: text(fm["vorversion"] ?? fm["previous_version"]) };
        }),
      resolve: (target, from) => cache.getFirstLinkpathDest(target, from)?.path,
      resolvedLinks: links,
      linksSure: sure,
      planText: await this.plugin.lists.readPlanText(),
      planResolve: (t) => cache.getFirstLinkpathDest(t, planPath)?.path,
    });
    const titles = new Map<string, string>();
    const languages = new Map<string, string>();
    for (const p of found.allTranslations) {
      const f = this.file(p);
      if (!f) continue;
      titles.set(p, this.titleOf(f));
      const language = text(readField(this.frontmatter(f), fields, "language"));
      if (language) languages.set(p, language);
    }
    return { file, title: this.titleOf(file), found, titles, languages };
  }

  /** What goes with the recipe; the translations only if `translations` is set (images and plan entries depend on it). */
  async preview(path: string, translations = true): Promise<DeletePreview | { ok: false; message: string }> {
    const s = await this.scan(path, translations);
    if (typeof s === "string") return { ok: false, message: s };
    const { found } = s;
    return {
      ok: true,
      title: s.title,
      images: found.images.map((i) => noteName(i)),
      imagesKept: found.imagesKept,
      backups: found.backups.length,
      translations: found.allTranslations.map((p) => ({
        path: p,
        title: s.titles.get(p) ?? noteName(p),
        ...(s.languages.has(p) ? { language: s.languages.get(p) } : {}),
      })),
      plan: entriesByDay(found.rows).map((d) => ({ date: d.date, titles: d.targets.map((t) => noteName(t)) })),
      shown: { files: [...found.translations, ...found.backups, ...found.images], targets: found.targets },
    };
  }

  /** Deletes the recipe and what belongs to it, as far as it is in `shown`; the result says whether the note itself is gone. */
  async run(path: string, o: { translations: boolean; title?: string; shown: Shown }): Promise<DeleteResult> {
    const s = await this.scan(path, o.translations);
    if (typeof s === "string") {
      new Notice(s);
      return { ok: false, message: s };
    }
    const title = o.title ?? s.title;
    try {
      await this.app.fileManager.trashFile(s.file);
    } catch (e) {
      const message = tr("deleteFailedNote", { title, error: errorText(e) });
      new Notice(message);
      return { ok: false, message };
    }
    const shownFiles = new Set(o.shown.files);
    const targets = new Set(s.found.targets.filter((t) => o.shown.targets.includes(t)));
    const left: string[] = [];
    let n = 0;
    for (const p of [...s.found.translations, ...s.found.backups, ...s.found.images]) {
      const f = shownFiles.has(p) ? this.file(p) : null;
      if (!f) continue;
      try {
        await this.app.fileManager.trashFile(f);
        n++;
      } catch {
        left.push(p);
      }
    }
    if (targets.size) {
      const done = await this.plugin.lists.editMealPlan({
        kind: "removeRecipe",
        from: todayIso(),
        matches: (t) => targets.has(t),
      });
      if (!done) left.push(tr("deleteLeftPlan"));
    }
    new Notice(
      left.length
        ? tr("deleteLeft", { title, left: left.join(", ") })
        : tr(n === 0 ? "deleteDone" : n === 1 ? "deleteDoneOne" : "deleteDoneMore", { title, n }),
    );
    return { ok: true };
  }
}
