// The notes of the recipe folder with the little that the frontmatter says (from Obsidian's metadata cache), for the
// code that matches notes to jobs without reading every note: the import sync (src/importSyncService.ts) and the
// improvement service (src/improveService.ts).
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { isRecipeFile } from "./folder";
import { importStateFrom, readField, type Fields } from "./noteFormat";

export interface NoteStub {
  path: string;
  job?: string;
  source?: string;
  importState?: string;
  importError?: string;
  modified: number;
  file: TFile;
  /** Obsidian has no cache entry for the file yet: the fields above are unknown, not empty. */
  uncached: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** What the frontmatter says about the import: the one place that maps it (cache or file text alike). */
export function stubFields(fm: Record<string, unknown>, fields: Fields) {
  return {
    job: str(readField(fm, fields, "job")),
    source: str(readField(fm, fields, "source")),
    importState: importStateFrom(readField(fm, fields, "importState")),
    importError: str(readField(fm, fields, "importError")),
  };
}

/** One note of the recipe folder as the metadata cache knows it. */
export function stubOf(p: BetterCookingPlugin, file: TFile): NoteStub {
  const cache = p.app.metadataCache.getFileCache(file);
  return {
    path: file.path,
    ...stubFields(cache?.frontmatter ?? {}, p.noteFormat().fields),
    modified: file.stat.mtime,
    file,
    uncached: !cache,
  };
}

export function recipeStubs(p: BetterCookingPlugin): NoteStub[] {
  const { app, settings, lists } = p;
  return app.vault
    .getMarkdownFiles()
    .filter((f) => !lists.isListNote(f.path) && isRecipeFile(f.path, settings.folder))
    .map((file) => stubOf(p, file));
}
