// Tastaturkürzel der Rezeptansicht ("/", Esc, Pfeile) dürfen nur greifen, wenn die Ansicht gemeint ist.
// Der Listener hängt am Fenster; ohne diese Prüfung schluckt er "/" oder Esc in normalen Notizen,
// auch wenn die Ansicht in einem Tab im Hintergrund liegt. Getestet in tests/tastatur.test.ts.

/** Eingabefelder, Textbereiche und bearbeitbare Bereiche (der Editor von Obsidian ist contenteditable). */
export function istEingabefeld(ziel: HTMLElement | null): boolean {
  if (!ziel) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName) || ziel.isContentEditable === true) return true;
  return !!ziel.closest?.('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
}

/**
 * Gehört der Tastendruck zur Ansicht? Ja, wenn das Ziel in der Ansicht liegt, oder wenn nichts den Fokus hat
 * (Ziel ist body) und die Ansicht sichtbar ist. Ein Tab im Hintergrund ist nicht sichtbar (display: none).
 */
export function tasteFuerAnsicht(ziel: HTMLElement | null, wurzel: HTMLElement | null): boolean {
  if (!wurzel || !wurzel.isConnected) return false;
  if (ziel && wurzel.contains(ziel)) return true;
  const ohneFokus = !ziel || ziel === ziel.ownerDocument?.body || ziel === ziel.ownerDocument?.documentElement;
  return ohneFokus && wurzel.getClientRects().length > 0;
}
