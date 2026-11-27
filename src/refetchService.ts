// "Fetch again" (issue #63) inside Obsidian: reads the source of a saved recipe again (in the plugin; the own AI only
// when the user asks for it), shows what would change, and on confirmation writes the merged note (src/refetch.ts).
// Just before it writes, the old version is copied into the subfolder Vorversionen; nothing is deleted except the
// files this very run created if writing fails. Claude and the GitHub action cannot do this: their contract only
// creates new notes (docs/import-contract.md).
import { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { loadPage, recipeFromHtml, refreshCover } from "./localImport";
import { recipeWithAi } from "./aiImport";
import { AI_KEY_ID } from "./ai";
import {
  backupName,
  backupText,
  canRefetch,
  coverChanged,
  newTexts,
  planRefetch,
  type Preview,
  type RefetchOptions,
} from "./refetch";
import type { Part } from "./fingerprint";
import { rememberCoverUrl } from "./coverMemory";
import { createNote, ensureFolder, freeNoteName } from "./vaultNames";
import { BACKUP_FOLDER, joinPath } from "./folder";
import { parseRecipe, todayIso } from "./parse";
import type { SchemaRecipe } from "./schemaorg";
import { cleanFeedback, feedbackWays, type FeedbackMaterial } from "./feedback";
import { fingerprintKnown } from "./improve";
import { busyMessage, feedbackCtx, freshWithFeedback } from "./feedbackService";
import type { Recipe } from "./types";
import { tr } from "./i18n";

interface Fresh {
  recipe: SchemaRecipe;
  coverUrl?: string;
  via: "page" | "ai";
  /** Feedback on a note without a readable fingerprint: every part counts as edited by the user (src/refetch.ts). */
  unknownEdits?: boolean;
  /** Read with the user's feedback: an improvement that started meanwhile stops the write. */
  feedback?: true;
}

/** The note changed between the backup and the write. */
class ChangedMeanwhile extends Error {}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Refetcher {
  /** What the last preview read, per note: "Update" writes exactly this, without loading the page again. */
  private pending = new Map<string, Fresh>();
  /** Pages already loaded for a preview, so "Read with my AI" does not load them again. */
  private pages = new Map<string, string>();
  /** Counter per note: a preview that finishes after the dialog was closed (or restarted) is dropped. */
  private runs = new Map<string, number>();

  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  /** The dialog was closed: a running preview is dropped (a request already sent cannot be taken back). */
  cancel(path: string) {
    this.runs.set(path, (this.runs.get(path) ?? 0) + 1);
    this.pages.delete(path);
  }

  /** Reads the source again and says what would change; writes nothing. The own AI only with `useAi`. */
  async preview(path: string, useAi = false): Promise<Preview> {
    const file = this.file(path);
    if (!file) return { ok: false, message: tr("refetchGone") };
    const run = (this.runs.get(path) ?? 0) + 1;
    this.runs.set(path, run);
    const stale = () => this.runs.get(path) !== run;
    const format = this.plugin.noteFormat();
    const text = await this.app.vault.read(file);
    const old = parseRecipe(path, text, 0, format.fields);
    const can = canRefetch(old);
    if (!can.ok) return { ok: false, message: tr(can.reason) };
    let html = this.pages.get(path);
    if (html === undefined) {
      const page = await loadPage(old.source!);
      if ("error" in page) return { ok: false, message: page.error };
      html = page.html;
      this.pages.set(path, html);
    }
    let fresh: Fresh | undefined;
    const local = recipeFromHtml(html, old.source!, format.lang);
    if (local) fresh = { ...local, via: "page" };
    else if (useAi && this.plugin.aiAvailable()) {
      const r = await recipeWithAi(this.plugin.ai(), this.plugin.secret(AI_KEY_ID), { url: old.source, html }, format);
      if ("error" in r) return { ok: false, message: r.error };
      fresh = { ...r, via: "ai" };
    }
    if (stale()) return { ok: false, message: "" };
    if (!fresh) return { ok: false, message: tr("refetchNoRecipe"), canUseAi: this.plugin.aiAvailable() };
    return this.settle(path, text, old, fresh);
  }

  /**
   * Reads the recipe again with the user's feedback (#120) through the own AI, whatever the page offers, and says what
   * would change. Nothing is read before this call; "Update" writes exactly what it read, like after `preview`.
   */
  async previewFeedback(path: string, feedback: string): Promise<Preview> {
    const file = this.file(path);
    if (!file) return { ok: false, message: tr("refetchGone") };
    const run = (this.runs.get(path) ?? 0) + 1;
    this.runs.set(path, run);
    const text = await this.app.vault.read(file);
    const old = parseRecipe(path, text, 0, this.plugin.noteFormat().fields);
    const way = feedbackWays(old, feedbackCtx(this.plugin));
    if (way.via !== "ai") return { ok: false, message: tr(way.via === "off" ? "feedbackOff" : "feedbackNone") };
    const clean = cleanFeedback(feedback);
    if (!clean) return { ok: false, message: tr("feedbackEmpty") };
    const busy = busyMessage(this.plugin, old);
    if (busy) return { ok: false, message: busy };
    const r = await freshWithFeedback(this.plugin, old, clean, way);
    if (this.runs.get(path) !== run) return { ok: false, message: "" };
    if ("error" in r) return { ok: false, message: r.error };
    const fresh: Fresh = {
      recipe: r.recipe,
      coverUrl: r.coverUrl,
      via: "ai",
      unknownEdits: !fingerprintKnown(old),
      feedback: true,
    };
    return this.settle(path, text, old, fresh, r.used);
  }

  /** Remembers what was read for "Update" and says what it changes in the note. */
  private settle(path: string, text: string, old: Recipe, fresh: Fresh, feedback?: FeedbackMaterial): Preview {
    this.pending.set(path, fresh);
    const plan = planRefetch(text, fresh.recipe, {
      format: this.plugin.noteFormat(),
      today: todayIso(),
      replace: [],
      unknownEdits: fresh.unknownEdits,
    });
    const changes = plan.changes;
    if (coverChanged(old, this.plugin.settings.coverUrls[path], fresh.coverUrl)) changes.push({ part: "image" });
    // Feedback shows the new text of each changed part, like a proposal: the user checks what the AI wrote.
    const details = feedback ? newTexts(fresh.recipe, changes, this.plugin.noteFormat(), todayIso()) : undefined;
    return { ok: true, changes, via: fresh.via, edited: plan.edited, ...(feedback ? { feedback, details } : {}) };
  }

  /** Writes what the last preview read: new cover image, backup of the old version, then the merged note. */
  async apply(path: string, replace: Part[]): Promise<{ ok: boolean; message?: string; stale?: boolean }> {
    const file = this.file(path);
    const fresh = this.pending.get(path);
    if (!file || !fresh) return { ok: false, message: tr("refetchGone") };
    const format = this.plugin.noteFormat();
    const today = todayIso();
    let cover: TFile | undefined;
    let written = false;
    try {
      const old = parseRecipe(path, await this.app.vault.read(file), 0, format.fields);
      const busy = fresh.feedback ? busyMessage(this.plugin, old) : undefined;
      if (busy) return { ok: false, message: busy };
      let image: string | undefined;
      if (fresh.coverUrl && coverChanged(old, this.plugin.settings.coverUrls[path], fresh.coverUrl)) {
        const current = old.image ? this.app.metadataCache.getFirstLinkpathDest(old.image, path) : null;
        cover = await refreshCover(this.app, this.plugin.settings.folder, file.basename, fresh.coverUrl, current);
        image = cover?.name;
      }
      const result = await writeMerged(this.plugin, file, fresh.recipe, {
        format,
        today,
        image,
        replace,
        unknownEdits: fresh.unknownEdits,
      });
      if (result.kind === "allKept") {
        if (cover) await this.app.fileManager.trashFile(cover).catch(() => undefined);
        return { ok: false, message: tr("refetchAllKept") };
      }
      if (result.kind === "conflict") {
        if (cover) await this.app.fileManager.trashFile(cover).catch(() => undefined);
        return { ok: false, message: tr("refetchChangedMeanwhile"), stale: true };
      }
      if (result.kind === "unchanged") {
        // The page's image turned out to be the same file: nothing to write, and no complaint in the dialog.
        await rememberCoverUrl(this.plugin, path, fresh.coverUrl);
        this.pending.delete(path);
        return { ok: true, message: tr("refetchNothing") };
      }
      written = true;
      this.pending.delete(path);
      await rememberCoverUrl(this.plugin, path, fresh.coverUrl);
      return { ok: true, message: tr("refetched", { title: fresh.recipe.title, backup: result.backup.name }) };
    } catch (e) {
      // The new cover image is of no use without the write: take it away again. Once the note is written it
      // belongs to the result and stays, whatever fails afterwards.
      if (!written && cover) await this.app.fileManager.trashFile(cover).catch(() => undefined);
      return { ok: false, message: tr("refetchFailed", { error: errorText(e).slice(0, 120) }) };
    }
  }
}

/** Copies the old note into `<recipe folder>/Vorversionen/` (src/refetch.ts backupText); returns the new file. */
async function saveBackup(plugin: BetterCookingPlugin, file: TFile, text: string, today: string): Promise<TFile> {
  const vault = plugin.app.vault;
  const folder = plugin.settings.folder;
  const dir = await ensureFolder(vault, joinPath(folder, BACKUP_FOLDER), folder);
  const base = backupName(file.basename, today);
  return createNote(
    vault,
    dir,
    freeNoteName(vault, dir, base),
    base,
    backupText(text, file.basename, plugin.noteFormat()),
  );
}

/** Why `writeMerged` did or did not write. */
export type MergeResult =
  | { kind: "written"; backup: TFile; before: string; after: string }
  /** The source has nothing the note does not have. */
  | { kind: "unchanged" }
  /** The source differs only in parts edited by hand that the caller did not ask to replace. */
  | { kind: "allKept" }
  /** The note changed between the backup and the write; nothing was written and the backup is gone again. */
  | { kind: "conflict" };

/**
 * Merges a freshly read recipe into a note: backup of the old version directly before writing, then the merge with
 * compare-and-set. Parts the user edited by hand since the import stay unless they are in `o.replace` (ADR 0006).
 * Also the way for improvements and feedback of processors to write.
 */
export async function writeMerged(
  plugin: BetterCookingPlugin,
  file: TFile,
  fresh: SchemaRecipe,
  o: RefetchOptions,
): Promise<MergeResult> {
  const vault = plugin.app.vault;
  const before = await vault.read(file);
  const plan = planRefetch(before, fresh, o);
  if (plan.text === before) return { kind: plan.changes.length ? "allKept" : "unchanged" };
  const backup = await saveBackup(plugin, file, before, o.today);
  try {
    await vault.process(file, (cur) => {
      if (cur !== before) throw new ChangedMeanwhile();
      return plan.text;
    });
  } catch (e) {
    await plugin.app.fileManager.trashFile(backup).catch(() => undefined);
    if (e instanceof ChangedMeanwhile) return { kind: "conflict" };
    throw e;
  }
  return { kind: "written", backup, before, after: plan.text };
}
