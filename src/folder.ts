// Recipe folder from the settings: clean the input and decide which files belong to it.
// Pure functions without Obsidian, tested in tests/folder.test.ts.

export const DEFAULT_FOLDER = "Recipes";

/** Subfolders of the recipe folder: images (src/localImport.ts) and older versions (src/refetch.ts). */
export const IMAGE_FOLDER = "Bilder";
export const BACKUP_FOLDER = "Vorversionen";
/** Where processors put improvement proposals (ADR 0007, src/improve.ts). */
export const IMPROVE_FOLDER = "Verbesserungen";

/** File name of an image of a note: `<note> Titelbild.webp`, `<note> Titelbild 2.webp`; `<note> Ablauf.svg` for the timeline. */
export const imageNameFor = (note: string, kind: "cover" | "timeline", extension: string, n = 1): string =>
  kind === "cover"
    ? `${note} Titelbild${n === 1 ? "" : ` ${n}`}.${extension}`
    : `${note} Ablauf${n === 1 ? "" : ` ${n}`}.svg`;

/** `name` inside the recipe folder (at the top of the vault for the folder ""); the path as written, not normalised. */
export const joinPath = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);

/**
 * Folder path as Obsidian stores it: "/" as separator, no leading or trailing slash.
 * Empty input gives the default folder; "/" alone stands for the top level of the vault ("").
 */
export function cleanFolder(input: string): string {
  const t = input.trim().replace(/\\/g, "/");
  if (!t) return DEFAULT_FOLDER;
  return t
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== ".")
    .join("/");
}

/** Is the path the folder or anywhere below it (for change events, including images in the subfolder)? */
export function inFolder(path: string, folder: string): boolean {
  return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** The recipe folder setting points to a folder that does not exist (the top level always exists). */
export function folderMissing(folder: string, exists: boolean): boolean {
  return folder !== "" && !exists;
}

/** Is the file a recipe note: Markdown directly in the folder, not AGENTS.md or README.md? */
export function isRecipeFile(path: string, folder: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  const cut = path.lastIndexOf("/");
  const parent = cut < 0 ? "" : path.slice(0, cut);
  const name = path.slice(cut + 1);
  return parent === folder && !/^(AGENTS|README)\.md$/i.test(name);
}

/** The first name `make(1)`, `make(2)` … that does not exist yet (one rule for notes, cover images and backups). */
export function firstFree(make: (n: number) => string, exists: (name: string) => boolean, max = 100): string {
  for (let i = 1; i < max; i++) {
    const name = make(i);
    if (!exists(name)) return name;
  }
  return make(Date.now());
}
