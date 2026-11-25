// Rezeptordner aus den Einstellungen: Eingabe bereinigen und prüfen, welche Dateien dazugehören.
// Reine Funktionen ohne Obsidian, getestet in tests/ordner.test.ts.

export const DEFAULT_FOLDER = "Recipes";

/**
 * Ordnerpfad wie Obsidian ihn speichert: "/" als Trenner, ohne führenden oder abschließenden Schrägstrich.
 * Leere Eingabe ergibt den Standardordner; "/" allein steht für die oberste Ebene des Vaults ("").
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

/** Liegt die Datei irgendwo unterhalb des Ordners (für Änderungsereignisse, auch Bilder im Unterordner)? */
export function inFolder(path: string, folder: string): boolean {
  return folder === "" || path.startsWith(`${folder}/`);
}

/** Ist die Datei eine Rezeptnotiz: Markdown direkt im Ordner, nicht AGENTS.md oder README.md? */
export function isRecipeFile(path: string, folder: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  const cut = path.lastIndexOf("/");
  const parent = cut < 0 ? "" : path.slice(0, cut);
  const name = path.slice(cut + 1);
  return parent === folder && !/^(AGENTS|README)\.md$/i.test(name);
}
