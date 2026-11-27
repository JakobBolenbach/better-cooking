// "Is this path taken?" and "where is this folder?" for every place that picks a new file name. The file systems of
// Windows, macOS and iOS ignore case and Unicode form, while `getAbstractFileByPath` does not, so names are compared
// among the children of the parent folder. Folders in another spelling are used as they are, never created twice.
import { normalizePath, type TAbstractFile, type TFile, type TFolder, type Vault } from "obsidian";
import { firstFree, joinPath, nameKey, nameTaken } from "./folder";

type Lookup = Pick<Vault, "getAbstractFileByPath" | "getFolderByPath" | "getRoot">;
type Writer = Lookup & Pick<Vault, "createFolder" | "create">;

const isFolder = (f: TAbstractFile): f is TFolder => "children" in f;

/**
 * The existing folder at `path` in the spelling it has in the vault (any case, any Unicode form; an exact name wins
 * over another spelling); null if none. The first `exact` path (the recipe folder of the settings, which the overview
 * reads exactly) must match exactly.
 */
export function findFolder(vault: Lookup, path: string, exact = ""): string | null {
  const clean = normalizePath(path);
  if (!clean || clean === "/") return "";
  if (vault.getFolderByPath(clean)) return clean;
  const strict = exact ? normalizePath(exact).split("/").length : 0;
  let folder = vault.getRoot();
  let real = "";
  for (const [i, part] of clean.split("/").entries()) {
    const folders = folder.children.filter(isFolder);
    const next =
      folders.find((c) => c.name === part) ??
      (i < strict ? undefined : folders.find((c) => nameKey(c.name) === nameKey(part)));
    if (!next) return null;
    folder = next;
    real = joinPath(real, next.name);
  }
  return real;
}

/**
 * The folder at `path` as it exists (see `findFolder`); only if none exists is it created. Returns its real path.
 * If creating fails because the folder appeared in the meantime, that folder is used.
 */
export async function ensureFolder(
  vault: Lookup & Pick<Vault, "createFolder">,
  path: string,
  exact = "",
): Promise<string> {
  const found = findFolder(vault, path, exact);
  if (found !== null) return found;
  const clean = normalizePath(path);
  const cut = clean.lastIndexOf("/");
  const parent = cut < 0 ? "" : await ensureFolder(vault, clean.slice(0, cut), exact);
  const real = joinPath(parent, clean.slice(cut + 1));
  try {
    await vault.createFolder(real);
  } catch (e) {
    const now = findFolder(vault, path, exact);
    if (now === null) throw e;
    return now;
  }
  return real;
}

/** Is `path` taken, also by a name that differs in case or Unicode form? */
export function pathTaken(vault: Lookup, rawPath: string): boolean {
  const path = normalizePath(rawPath);
  if (vault.getAbstractFileByPath(path)) return true;
  const cut = path.lastIndexOf("/");
  const parentPath = cut < 0 ? "" : findFolder(vault, path.slice(0, cut));
  if (parentPath === null) return false;
  const parent = parentPath ? vault.getFolderByPath(parentPath) : vault.getRoot();
  return (
    !!parent &&
    nameTaken(
      parent.children.map((c) => c.name),
      path.slice(cut + 1),
    )
  );
}

/** "Brot", otherwise "Brot 2", "Brot 3" … : the first note name in `dir` that is free. */
export const freeNoteName = (vault: Lookup, dir: string, base: string): string =>
  firstFree(
    (i) => (i === 1 ? base : `${base} ${i}`),
    (n) => pathTaken(vault, joinPath(dir, `${n}.md`)),
  );

/**
 * Creates the note `<dir>/<name>.md`. Obsidian's index can lag behind the disk (sync, another device, a file it has
 * not seen yet): if `create` fails and the index now shows the name as taken, it tries once more with the next free
 * name for `base`; any other error goes through.
 */
export async function createNote(vault: Writer, dir: string, name: string, base: string, text: string): Promise<TFile> {
  const path = normalizePath(joinPath(dir, `${name}.md`));
  try {
    return await vault.create(path, text);
  } catch (e) {
    if (!pathTaken(vault, path)) throw e;
    return vault.create(normalizePath(joinPath(dir, `${freeNoteName(vault, dir, base)}.md`)), text);
  }
}
