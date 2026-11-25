// Recipe folder from the settings: clean the input and decide which files belong to it.
// Pure functions without Obsidian, tested in tests/folder.test.ts.

export const DEFAULT_FOLDER = "Recipes";

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

/** Is the file anywhere below the folder (for change events, including images in the subfolder)? */
export function inFolder(path: string, folder: string): boolean {
  return folder === "" || path.startsWith(`${folder}/`);
}

/** Is the file a recipe note: Markdown directly in the folder, not AGENTS.md or README.md? */
export function isRecipeFile(path: string, folder: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  const cut = path.lastIndexOf("/");
  const parent = cut < 0 ? "" : path.slice(0, cut);
  const name = path.slice(cut + 1);
  return parent === folder && !/^(AGENTS|README)\.md$/i.test(name);
}
