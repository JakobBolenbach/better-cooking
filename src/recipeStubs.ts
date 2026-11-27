// The notes of the recipe folder with the little that the frontmatter says (from Obsidian's metadata cache), for the
// code that matches notes to jobs without reading every note: the import sync (src/importSyncService.ts) and the
// improvement service (src/improveService.ts).
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { isRecipeFile } from "./folder";
import { importStateFrom, readField } from "./noteFormat";

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

export function recipeStubs(p: BetterCookingPlugin): NoteStub[] {
  const { app, settings, lists } = p;
  const fields = p.noteFormat().fields;
  return app.vault
    .getMarkdownFiles()
    .filter((f) => !lists.isListNote(f.path) && isRecipeFile(f.path, settings.folder))
    .map((file) => {
      const cache = app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter ?? {};
      return {
        path: file.path,
        job: str(readField(fm, fields, "job")),
        source: str(readField(fm, fields, "source")),
        importState: importStateFrom(readField(fm, fields, "importState")),
        importError: str(readField(fm, fields, "importError")),
        modified: file.stat.mtime,
        file,
        uncached: !cache,
      };
    });
}
