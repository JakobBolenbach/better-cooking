// "Delete recipe" (issue #119) inside Obsidian: reads what belongs to a recipe (src/deletePlan.ts), tells the dialog,
// and on confirmation moves it all to the trash (`fileManager.trashFile`, so Obsidian's setting decides where it
// goes). Order: the recipe note first (if that fails nothing else happens), then translations, older versions and
// images no kept note links to, then the entries of the meal plan. If a later step fails, the notice names what is left.
// The remembered cover address and the amounts per recipe on the shopping list go through the delete events of
// src/main.ts and src/listNotes.ts.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import {
  BACKUP_FOLDER,
  backupsOf,
  entriesByDay,
  futurePlanEntries,
  linkOf,
  orphanedImages,
  planLinkMatcher,
  translationsOf,
  type DeletePreview,
  type NoteRef,
} from "./deletePlan";
import { isRecipeFile } from "./folder";
import { readField } from "./noteFormat";
import { noteName, todayIso } from "./parse";
import { tr } from "./i18n";

export type DeleteResult = { ok: boolean; message?: string };

interface Scan {
  file: TFile;
  title: string;
  /** What goes after the note itself. */
  translations: TFile[];
  backups: TFile[];
  images: TFile[];
  /** Link texts of the plan entries that go (worked out before the files go: the links no longer resolve afterwards). */
  targets: Set<string>;
  plan: DeletePreview["plan"];
  allTranslations: DeletePreview["translations"];
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const baseOf = (target: string) => noteName(target.replace(/^.*\//, ""));

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

  private async scan(path: string, withTranslations: boolean): Promise<Scan | string> {
    const { folder } = this.plugin.settings;
    const file = this.file(path);
    if (!file) return tr("deleteGone");
    if (!isRecipeFile(path, folder) || this.plugin.lists.isListNote(path)) return tr("deleteNotRecipe");
    const fields = this.plugin.noteFormat().fields;
    const files = this.app.vault.getMarkdownFiles();
    const recipes = files.filter((f) => isRecipeFile(f.path, folder) && !this.plugin.lists.isListNote(f.path));
    const ref = (f: TFile): NoteRef => ({ path: f.path, name: f.basename });
    const all = translationsOf(
      ref(file),
      recipes.map((f) => ({
        path: f.path,
        translationOf: linkOf(readField(this.frontmatter(f), fields, "translationOf")),
      })),
    )
      .map((p) => this.file(p))
      .filter((f): f is TFile => !!f);
    const translations = withTranslations ? all : [];
    const going = [file, ...translations];
    const versions = files
      .filter((f) => f.path.startsWith(`${folder ? `${folder}/` : ""}${BACKUP_FOLDER}/`))
      .map((f) => {
        const fm = this.frontmatter(f);
        return { path: f.path, link: linkOf(fm["vorversion"] ?? fm["previous_version"]) };
      });
    const backups = [...new Set(going.flatMap((f) => backupsOf(ref(f), versions, folder)))]
      .map((p) => this.file(p))
      .filter((f): f is TFile => !!f);
    const images = orphanedImages(
      [...going, ...backups].map((f) => f.path),
      this.app.metadataCache.resolvedLinks,
      folder,
    )
      .map((p) => this.file(p))
      .filter((f): f is TFile => !!f);
    const planPath = this.plugin.lists.mealPlanPath();
    const matches = planLinkMatcher(
      going.map(ref),
      (t) => this.app.metadataCache.getFirstLinkpathDest(t, planPath)?.path,
    );
    const rows = futurePlanEntries(await this.plugin.lists.readPlanText(), todayIso(), matches);
    return {
      file,
      title: this.titleOf(file),
      translations,
      backups,
      images,
      targets: new Set(rows.map((r) => r.target)),
      plan: entriesByDay(rows).map((d) => ({ date: d.date, titles: d.targets.map(baseOf) })),
      allTranslations: all.map((f) => {
        const language = this.frontmatter(f)[fields.language];
        return { path: f.path, title: this.titleOf(f), ...(typeof language === "string" ? { language } : {}) };
      }),
    };
  }

  /** What goes with the recipe; the translations only if `translations` is set (images and plan entries depend on it). */
  async preview(path: string, translations = true): Promise<DeletePreview | { ok: false; message: string }> {
    const s = await this.scan(path, translations);
    if (typeof s === "string") return { ok: false, message: s };
    return {
      ok: true,
      title: s.title,
      images: s.images.map((f) => f.name),
      backups: s.backups.length,
      translations: s.allTranslations,
      plan: s.plan,
    };
  }

  /** Moves the recipe and what belongs to it to the trash; the result says whether the note itself is gone. */
  async run(path: string, o: { translations: boolean; title?: string }): Promise<DeleteResult> {
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
    const left: string[] = [];
    let n = 0;
    for (const f of [...s.translations, ...s.backups, ...s.images]) {
      try {
        await this.app.fileManager.trashFile(f);
        n++;
      } catch {
        left.push(f.path);
      }
    }
    if (s.targets.size) {
      const done = await this.plugin.lists.editMealPlan({
        kind: "removeRecipe",
        from: todayIso(),
        matches: (t) => s.targets.has(t),
      });
      if (!done) left.push(tr("deleteLeftPlan"));
    }
    new Notice(
      left.length
        ? tr("deleteLeft", { title, left: left.join(", ") })
        : n
          ? tr("deleteDoneMore", { title, n })
          : tr("deleteDone", { title }),
    );
    return { ok: true };
  }
}
