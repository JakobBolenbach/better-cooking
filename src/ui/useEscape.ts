import { useEffect } from "preact/hooks";
import { escapeTarget, type EscapeLayer } from "./keyboard";

/**
 * Esc handling of the App. `layers` says per layer whether it is open and how to close it.
 * Returns a function that closes the topmost open layer and reports whether there was one.
 * `register` hands the same function to the host (Obsidian's key scope) while the App is mounted.
 */
export function useEscape(
  layers: Record<EscapeLayer, [open: boolean, close: () => void]>,
  register?: (close: (() => boolean) | null) => void,
): () => boolean {
  const closeTop = () => {
    const open = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v[0]])) as Record<EscapeLayer, boolean>;
    const layer = escapeTarget(open);
    if (layer) layers[layer][1]();
    return !!layer;
  };
  useEffect(() => {
    register?.(closeTop);
    return () => register?.(null);
  });
  return closeTop;
}
