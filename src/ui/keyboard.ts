// Keyboard shortcuts of the recipe view ("/", Esc, arrows) may only act when the view is meant.
// The listener sits on the window; without this check it swallows "/" or Esc in ordinary notes,
// even when the view is in a background tab. Tested in tests/keyboard.test.ts.

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
