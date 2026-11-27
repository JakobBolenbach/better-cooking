// "Is this path taken?" for every place that picks a new file name. The file systems of Windows, macOS and iOS ignore
// case and Unicode form, while `getAbstractFileByPath` does not, so the names in the parent folder are compared.
import type { Vault } from "obsidian";
import { nameTaken } from "./folder";

type Lookup = Pick<Vault, "getAbstractFileByPath" | "getFolderByPath" | "getRoot">;

export function pathTaken(vault: Lookup, path: string): boolean {
  if (vault.getAbstractFileByPath(path)) return true;
  const cut = path.lastIndexOf("/");
  const parent = cut < 0 ? vault.getRoot() : vault.getFolderByPath(path.slice(0, cut));
  return (
    !!parent &&
    nameTaken(
      parent.children.map((c) => c.name),
      path.slice(cut + 1),
    )
  );
}
