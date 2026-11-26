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
export type EscapeLayer = "attempt" | "dialog" | "view" | "import" | "cooking" | "recipe";

/** Which layers are open right now. */
export type OpenLayers = Record<EscapeLayer, boolean>;

/** The layer Esc closes: the topmost open one, or null if nothing is open. */
export function escapeTarget(open: OpenLayers): EscapeLayer | null {
  const order: EscapeLayer[] = ["attempt", "dialog", "view", "import", "cooking", "recipe"];
  return order.find((l) => open[l]) ?? null;
}

/** A text field (input or textarea) that already has content. */
export function fieldHasText(target: HTMLElement | null): boolean {
  if (!target || !/^(INPUT|TEXTAREA)$/.test(target.tagName)) return false;
  return ((target as HTMLInputElement | HTMLTextAreaElement).value ?? "").length > 0;
}

export type EscapeAction = EscapeLayer | "leave-field" | "clear-search" | null;

/**
 * What one Esc press does. A field with text inside a layer is only left first (focus goes to the layer),
 * the next Esc closes the layer. The search field without an open layer is cleared. null: nothing to do.
 */
export function escapeAction(o: { open: OpenLayers; fieldHasText: boolean; inSearch: boolean }): EscapeAction {
  const layer = escapeTarget(o.open);
  if (layer) return o.fieldHasText ? "leave-field" : layer;
  return o.inSearch && o.fieldHasText ? "clear-search" : null;
}

/** A dialog belongs to the recipe it was opened for: it is only shown while that recipe is open. */
export function dialogFor<D extends string>(
  dialog: { kind: D; path: string } | null,
  openPath: string | null,
): D | null {
  return dialog && dialog.path === openPath ? dialog.kind : null;
}
