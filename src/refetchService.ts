// "Fetch again" (issue #63) inside Obsidian: reads the source of a saved recipe again (in the plugin, or with the
// own AI when the page has no recipe data), shows what would change, and on confirmation writes the merged note
// (src/refetch.ts). Before it writes, the old version is copied into the subfolder Vorversionen; nothing is deleted.
// Claude and the GitHub action cannot do this: their contract only creates new notes (docs/import-contract.md).
import { TFile, normalizePath } from "obsidian";
import type BetterCookingPlugin from "./main";
import { loadPage, recipeFromHtml, refreshCover } from "./localImport";
import { recipeWithAi } from "./aiImport";
import { AI_KEY_ID } from "./ai";
import { backupName, planRefetch, type Preview } from "./refetch";
import { parseRecipe, todayIso } from "./parse";
import { detectSource } from "./source";
import type { SchemaRecipe } from "./schemaorg";
import { tr } from "./i18n";

interface Fresh {
  recipe: SchemaRecipe;
  coverUrl?: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Refetcher {
  /** What the last preview read, per note: "Update" writes exactly this, without loading the page again. */
  private pending = new Map<string, Fresh & { via: "page" | "ai" }>();

  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  /** Reads the source again and says what would change; writes nothing. */
  async preview(path: string): Promise<Preview> {
    const file = this.file(path);
    if (!file) return { ok: false, message: tr("refetchGone") };
    const format = this.plugin.noteFormat();
    const text = await this.app.vault.read(file);
    const old = parseRecipe(path, text, 0, format.fields);
    if (!old.source || detectSource(old.source).kind !== "webseite" || old.translationOf)
      return { ok: false, message: tr("refetchPagesOnly") };
    const page = await loadPage(old.source);
    if ("error" in page) return { ok: false, message: page.error };
    let fresh: (Fresh & { via: "page" | "ai" }) | undefined;
    const local = recipeFromHtml(page.html, old.source, format.lang);
    if (local) fresh = { ...local, via: "page" };
    else if (this.plugin.aiAvailable()) {
      const r = await recipeWithAi(
        this.plugin.ai(),
        this.plugin.secret(AI_KEY_ID),
        { url: old.source, html: page.html },
        format,
      );
      if ("error" in r) return { ok: false, message: r.error };
      fresh = { ...r, via: "ai" };
    }
    if (!fresh) return { ok: false, message: tr("refetchNoRecipe") };
    this.pending.set(path, fresh);
    const { changes } = planRefetch(path, text, fresh.recipe, { format, today: todayIso() });
    return { ok: true, changes, via: fresh.via };
  }

  /** Writes what the last preview read: backup of the old version first, then the merged note. */
  async apply(path: string): Promise<{ ok: boolean; message?: string }> {
    const file = this.file(path);
    const fresh = this.pending.get(path);
    if (!file || !fresh) return { ok: false, message: tr("refetchGone") };
    const format = this.plugin.noteFormat();
    const folder = this.plugin.settings.folder;
    try {
      const oldText = await this.app.vault.read(file);
      const today = todayIso();
      if (!planRefetch(path, oldText, fresh.recipe, { format, today }).changes.length)
        return { ok: false, message: tr("refetchNothing") };
      const backup = await this.saveBackup(file, oldText, today);
      const old = parseRecipe(path, oldText, 0, format.fields);
      const current = old.image ? this.app.metadataCache.getFirstLinkpathDest(old.image, path) : null;
      const image =
        fresh.coverUrl && (current || !old.image)
          ? await refreshCover(this.app, folder, file.basename, fresh.coverUrl, current)
          : undefined;
      await this.app.vault.process(file, (cur) => planRefetch(path, cur, fresh.recipe, { format, today, image }).text);
      this.pending.delete(path);
      return { ok: true, message: tr("refetched", { title: fresh.recipe.title, backup }) };
    } catch (e) {
      return { ok: false, message: tr("refetchFailed", { error: errorText(e).slice(0, 120) }) };
    }
  }

  /** Copies the old note into `<recipe folder>/Vorversionen/`; returns the file's name. */
  private async saveBackup(file: TFile, text: string, today: string): Promise<string> {
    const dir = normalizePath(`${this.plugin.settings.folder}/Vorversionen`);
    if (!this.app.vault.getFolderByPath(dir)) await this.app.vault.createFolder(dir);
    const base = backupName(file.basename, today);
    let name = base;
    for (let i = 2; this.app.vault.getAbstractFileByPath(`${dir}/${name}.md`); i++) name = `${base} ${i}`;
    await this.app.vault.create(`${dir}/${name}.md`, text);
    return `${name}.md`;
  }
}
