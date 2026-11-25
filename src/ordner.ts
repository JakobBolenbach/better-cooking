// Rezeptordner aus den Einstellungen: Eingabe bereinigen und prüfen, welche Dateien dazugehören.
// Reine Funktionen ohne Obsidian, getestet in tests/ordner.test.ts.

export const ORDNER_STANDARD = "Recipes";

/**
 * Ordnerpfad wie Obsidian ihn speichert: "/" als Trenner, ohne führenden oder abschließenden Schrägstrich.
 * Leere Eingabe ergibt den Standardordner; "/" allein steht für die oberste Ebene des Vaults ("").
 */
export function ordnerBereinigen(eingabe: string): string {
  const t = eingabe.trim().replace(/\\/g, "/");
  if (!t) return ORDNER_STANDARD;
  return t
    .split("/")
    .map((teil) => teil.trim())
    .filter((teil) => teil && teil !== ".")
    .join("/");
}

/** Liegt die Datei irgendwo unterhalb des Ordners (für Änderungsereignisse, auch Bilder im Unterordner)? */
export function imOrdner(pfad: string, ordner: string): boolean {
  return ordner === "" || pfad.startsWith(`${ordner}/`);
}

/** Ist die Datei eine Rezeptnotiz: Markdown direkt im Ordner, nicht AGENTS.md oder README.md? */
export function istRezeptDatei(pfad: string, ordner: string): boolean {
  if (!pfad.toLowerCase().endsWith(".md")) return false;
  const schnitt = pfad.lastIndexOf("/");
  const eltern = schnitt < 0 ? "" : pfad.slice(0, schnitt);
  const name = pfad.slice(schnitt + 1);
  return eltern === ordner && !/^(AGENTS|README)\.md$/i.test(name);
}
