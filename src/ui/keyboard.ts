// Tastaturkürzel der Rezeptansicht ("/", Esc, Pfeile) dürfen nur greifen, wenn die Ansicht gemeint ist.
// Der Listener hängt am Fenster; ohne diese Prüfung schluckt er "/" oder Esc in normalen Notizen,
// auch wenn die Ansicht in einem Tab im Hintergrund liegt. Getestet in tests/tastatur.test.ts.

/** Eingabefelder, Textbereiche und bearbeitbare Bereiche (der Editor von Obsidian ist contenteditable). */
export function isInputField(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable === true) return true;
  return !!target.closest?.('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
}

/**
 * Gehört der Tastendruck zur Ansicht? Ja, wenn das Ziel in der Ansicht liegt, oder wenn nichts den Fokus hat
 * (Ziel ist body) und die Ansicht sichtbar ist. Ein Tab im Hintergrund ist nicht sichtbar (display: none).
 */
export function keyForView(target: HTMLElement | null, root: HTMLElement | null): boolean {
  if (!root || !root.isConnected) return false;
  if (target && root.contains(target)) return true;
  const withoutFocus =
    !target || target === target.ownerDocument?.body || target === target.ownerDocument?.documentElement;
  return withoutFocus && root.getClientRects().length > 0;
}
