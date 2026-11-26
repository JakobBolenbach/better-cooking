import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Direction } from "../tapZones";
import {
  escapeAction,
  fieldChanged,
  isInputField,
  isTextField,
  keyForView,
  slashAllowed,
  type EscapeLayer,
} from "./keyboard";

/** Esc, as the host calls it: handles one press for the element that has the focus. */
export type EscapeHandler = (target: HTMLElement | null) => void;

export interface KeyboardOptions {
  root: RefObject<HTMLElement>;
  searchRef: RefObject<HTMLInputElement>;
  /** Per layer: is it open (same condition as rendering it), and how to close it. */
  layers: Record<EscapeLayer, [open: boolean, close: () => void]>;
  onClearSearch: () => void;
  onSlash: () => void;
  /** Cooking mode only: move a step. */
  onStep?: (direction: Direction) => void;
  /** Hands the Esc handler to the host (Obsidian's key scope) while the App is mounted. */
  registerEscape?: (handle: EscapeHandler | null) => void;
}

/** Where the layers that replace the page live; the focus must leave them before they close. */
const LAYER_BOX: Partial<Record<EscapeLayer, string>> = { recipe: ".rz-detail-ebene", cooking: ".rz-koch" };

/**
 * Keyboard of the App: "/" focuses the search, arrows move through the cooking steps, Esc closes the top layer.
 * Inside Obsidian the host handles Esc in its own key scope (`registerEscape`), because Obsidian's keymap would
 * switch the tab before a window listener sees it. Without `registerEscape` (preview) the window handles Esc.
 * The listeners sit on the window of the view and on the view's root element: if Obsidian moves the view to a
 * popout window without creating it again, the root listener still gets keys with the focus in the view.
 */
export function useKeyboard(o: KeyboardOptions) {
  // Handlers are registered once and always see the latest options.
  const latest = useRef(o);
  latest.current = o;
  const open = Object.values(o.layers).filter(([isOpen]) => isOpen).length;
  const before = useRef(open);

  // A layer closed and the focus fell to the body: keep it in the view, so the view's key scope stays active.
  useEffect(() => {
    const root = o.root.current;
    const active = root?.ownerDocument.activeElement;
    if (open < before.current && root && (!active || active === root.ownerDocument.body))
      root.focus({ preventScroll: true });
    before.current = open;
  }, [open]);

  useEffect(() => {
    const root = latest.current.root.current;
    const edited = new WeakSet<Element>(); // text fields the user typed in (not prefilled ones)
    const openNow = () =>
      Object.fromEntries(Object.entries(latest.current.layers).map(([k, v]) => [k, v[0]])) as Record<
        EscapeLayer,
        boolean
      >;
    const handle = (target: HTMLElement | null) => {
      const c = latest.current;
      const inSearch = !!target && (target === c.searchRef.current || !!target.closest(".rz-suche"));
      const action = escapeAction({
        open: openNow(),
        fieldChanged: fieldChanged(target, edited),
        inSearch,
        searchHasText: isTextField(target) && target.value.length > 0,
      });
      if (action === "leave-field")
        (target?.closest<HTMLElement>(".rz-fenster") ?? c.root.current)?.focus({ preventScroll: true });
      else if (action === "clear-search") c.onClearSearch();
      else if (action) {
        // Move the focus out of the layer first, so it never falls to the body in between.
        const box = LAYER_BOX[action];
        const doc = c.root.current?.ownerDocument;
        if (box && doc?.activeElement?.closest(box)) c.root.current?.focus({ preventScroll: true });
        c.layers[action][1]();
      }
      return action !== null;
    };
    const register = latest.current.registerEscape;
    register?.((target) => void handle(target));
    const seen = new WeakSet<Event>(); // window and root both see the event: handle it once
    const key = (e: KeyboardEvent) => {
      if (seen.has(e)) return;
      seen.add(e);
      const c = latest.current;
      const target = e.target as HTMLElement | null;
      if (!keyForView(target, c.root.current)) return;
      const inField = isInputField(target);
      if (e.key === "Escape") {
        if (!register && handle(target)) e.preventDefault();
      } else if (e.key === "/" && !inField && slashAllowed(openNow())) {
        e.preventDefault();
        c.onSlash();
        // Wide layout has the search in the sidebar, narrow layout above the list: use the visible one.
        const fields = Array.from(c.root.current?.querySelectorAll<HTMLInputElement>(".rz-suche input") ?? []).filter(
          (i) => i.offsetParent,
        );
        (fields[0] ?? c.searchRef.current)?.focus();
      } else if (c.onStep && !inField && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        c.onStep(e.key === "ArrowRight" ? "next" : "back");
      }
    };
    const input = (e: Event) => {
      if (e.isTrusted && e.target) edited.add(e.target as Element);
    };
    const win = root?.ownerDocument.defaultView ?? window;
    win.addEventListener("keydown", key);
    root?.addEventListener("keydown", key);
    root?.addEventListener("input", input, true);
    return () => {
      win.removeEventListener("keydown", key);
      root?.removeEventListener("keydown", key);
      root?.removeEventListener("input", input, true);
      register?.(null);
    };
  }, []);
}
