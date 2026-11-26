import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";
import { escapeTarget, isInputField, keyForView, type EscapeLayer } from "./keyboard";

export interface KeyboardOptions {
  root: RefObject<HTMLElement>;
  searchRef: RefObject<HTMLInputElement>;
  /** Per layer: is it open, and how to close it. */
  layers: Record<EscapeLayer, [open: boolean, close: () => void]>;
  /** "/" may focus the search (not in cooking mode or the import dialog). */
  slashOk: boolean;
  onSlash: () => void;
  /** Cooking mode only: move a step. */
  onStep?: (delta: number) => void;
  /** Hands the Esc function to the host (Obsidian's key scope) while the App is mounted. */
  registerEscape?: (close: (() => boolean) | null) => void;
}

/**
 * Keyboard of the App: "/" focuses the search, arrows move through the cooking steps, Esc closes the top layer.
 * Inside Obsidian the host handles Esc in its own key scope (`registerEscape`), because Obsidian's keymap would
 * switch the tab before a window listener sees it. Without `registerEscape` (preview) the window handles Esc.
 */
export function useKeyboard(o: KeyboardOptions) {
  const closeTop = () => {
    const open = Object.fromEntries(Object.entries(o.layers).map(([k, v]) => [k, v[0]])) as Record<
      EscapeLayer,
      boolean
    >;
    const layer = escapeTarget(open);
    if (layer) o.layers[layer][1]();
    return !!layer;
  };
  useEffect(() => {
    o.registerEscape?.(closeTop);
    return () => o.registerEscape?.(null);
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!keyForView(target, o.root.current)) return;
      const inField = isInputField(target);
      if (e.key === "Escape") {
        if (o.registerEscape || !closeTop()) return;
        e.preventDefault();
      } else if (e.key === "/" && !inField && o.slashOk) {
        e.preventDefault();
        o.onSlash();
        // Wide layout has the search in the sidebar, narrow layout above the list: use the visible one.
        const fields = Array.from(o.root.current?.querySelectorAll<HTMLInputElement>(".rz-suche input") ?? []).filter(
          (i) => i.offsetParent,
        );
        (fields[0] ?? o.searchRef.current)?.focus();
      } else if (o.onStep && !inField && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        o.onStep(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
}
