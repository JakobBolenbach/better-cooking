// "Is this path taken?" and "where is this folder?" for every place that picks a new file name. The file systems of
// Windows, macOS and iOS ignore case and Unicode form, while `getAbstractFileByPath` does not, so names are compared
// among the children of the parent folder. Folders in another spelling are used as they are, never created twice.
import { normalizePath, type TAbstractFile, type TFile, type TFolder, type Vault } from "obsidian";
import { firstFree, joinPath, nameKey, nameTaken } from "./folder";

type Lookup = Pick<Vault, "getAbstractFileByPath" | "getFolderByPath" | "getRoot">;
type Writer = Lookup & Pick<Vault, "createFolder" | "create">;

const isFolder = (f: TAbstractFile): f is TFolder => "children" in f;

/** The existing folder at `path` in the spelling it has in the vault (any case, any Unicode form); null if none. */
export function findFolder(vault: Lookup, path: string): string | null {
  const clean = normalizePath(path);
  if (!clean || clean === "/") return "";
  if (vault.getFolderByPath(clean)) return clean;
  let folder = vault.getRoot();
  let real = "";
  for (const part of clean.split("/")) {
    const next = folder.children.find((c): c is TFolder => isFolder(c) && nameKey(c.name) === nameKey(part));
    if (!next) return null;
    folder = next;
    real = joinPath(real, next.name);
  }
  return real;
}

/** The folder at `path` as it exists (see `findFolder`); only if none exists is it created. Returns its real path. */
export async function ensureFolder(vault: Lookup & Pick<Vault, "createFolder">, path: string): Promise<string> {
  const found = findFolder(vault, path);
  if (found !== null) return found;
  const clean = normalizePath(path);
  const cut = clean.lastIndexOf("/");
  const parent = cut < 0 ? "" : await ensureFolder(vault, clean.slice(0, cut));
  const real = joinPath(parent, clean.slice(cut + 1));
  await vault.createFolder(real);
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
 * Creates the note `<dir>/<name>.md`. If the name was taken in the meantime (another sync, another device), it tries
 * once more with the next free name for `base`; any other error goes through.
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
