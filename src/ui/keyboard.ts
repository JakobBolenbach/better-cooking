// Keyboard rules of the recipe view ("/", Esc, arrows), all pure and tested in tests/keyboard.test.ts.
// Shortcuts may only act when the view is meant: without keyForView they would swallow "/" or Esc in
// ordinary notes, even when the view is in a background tab. Esc decisions: escapeAction.

/** Input fields, text areas and editable regions (Obsidian's editor is contenteditable). */
export function isInputField(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable === true) return true;
  return !!target.closest?.('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
}

/**
 * Does the key press belong to the view? Yes if the target is inside the view, or if nothing has focus
 * (target is body) and the view is visible. A background tab is not visible (display: none).
 */
export function keyForView(target: HTMLElement | null, root: HTMLElement | null): boolean {
  if (!root || !root.isConnected) return false;
  if (target && root.contains(target)) return true;
  const withoutFocus =
    !target || target === target.ownerDocument?.body || target === target.ownerDocument?.documentElement;
  return withoutFocus && root.getClientRects().length > 0;
}

/** Layers Esc can close, topmost first. */
export type EscapeLayer =
  "attempt" | "dialog" | "view" | "import" | "cooking" | "recipe" | "ask" | "details" | "planDialog" | "page";

/** Which layers are open right now. */
export type OpenLayers = Record<EscapeLayer, boolean>;

/** Topmost first. "ask" (question on the shopping list), "details" (an opened item) and "planDialog" (meal plan page) lie on a page. */
export const ESCAPE_ORDER: readonly EscapeLayer[] = [
  "attempt",
  "dialog",
  "view",
  "import",
  "cooking",
  "recipe",
  "ask",
  "details",
  "planDialog",
  "page",
];

/** The layer Esc closes: the topmost open one, or null if nothing is open. */
export function escapeTarget(open: OpenLayers): EscapeLayer | null {
  return ESCAPE_ORDER.find((l) => open[l]) ?? null;
}

const TEXT_TYPES = /^(text|search|url|email|number|tel|password|date|time|datetime-local|month|week)$/;

/** Textarea or text-like input (not checkbox, radio, range, button …). */
export function isTextField(target: HTMLElement | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!target) return false;
  if (target.tagName === "TEXTAREA") return true;
  return target.tagName === "INPUT" && TEXT_TYPES.test((target as HTMLInputElement).type || "text");
}

/** A text field the user changed (it is in `edited`, filled from input events) and that still has content. */
export function fieldChanged(target: HTMLElement | null, edited: WeakSet<Element>): boolean {
  return isTextField(target) && edited.has(target) && target.value.length > 0;
}

export type EscapeAction = EscapeLayer | "leave-field" | "clear-search" | null;

/**
 * What one Esc press does. A text field the user changed, inside a layer, is only left first (focus goes to the
 * layer), the next Esc closes the layer. Unchanged or prefilled fields do not hold Esc back. The search field
 * with text is cleared when no layer is open. null: nothing to do.
 */
export function escapeAction(o: {
  open: OpenLayers;
  fieldChanged: boolean;
  inSearch: boolean;
  searchHasText: boolean;
}): EscapeAction {
  const layer = escapeTarget(o.open);
  if (layer) return o.fieldChanged ? "leave-field" : layer;
  return o.inSearch && o.searchHasText ? "clear-search" : null;
}

/** "/" jumps to the search only on the overview, a page or the recipe page, not above a dialog or cooking mode. */
export function slashAllowed(open: OpenLayers): boolean {
  const top = escapeTarget(open);
  return top === null || top === "recipe" || top === "page" || top === "ask" || top === "details";
}

/**
 * Esc in the view's key scope: inside the view without modifiers it is ours (even if nothing closes, so
 * Obsidian never switches the tab); anything else goes on to Obsidian.
 */
export function escapeHandling(o: { inView: boolean; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }) {
  return o.inView && !(o.ctrl || o.meta || o.alt || o.shift) ? "ours" : "pass";
}

/** A dialog belongs to the recipe it was opened for: it is only shown while that recipe is open. */
export function dialogFor<D extends string>(
  dialog: { kind: D; path: string } | null,
  openPath: string | null,
): D | null {
  return dialog && dialog.path === openPath ? dialog.kind : null;
}
