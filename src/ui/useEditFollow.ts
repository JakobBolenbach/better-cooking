// After an edit of a note from a page: run it, then move the focus (the element the user was on is gone or moved) and
// tell screen readers what happened. Shared by the shopping list and the meal plan page.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

/** Where the focus goes after the edit: an element by its key, the page title, or nowhere (the field keeps it). */
export interface Follow {
  /** `target` overrides the hook's selector (e.g. the button that was pressed). */
  focus: { key: string; target?: string } | "title" | "field";
  say: (count: number) => string;
}

export function useEditFollow<E>(o: {
  /** Text of the note; a new text means the edit arrived. */
  text: string;
  /** A number the announcement may use (open items), as it is after the edit. */
  count: number;
  /** The page; its elements with `data-key` are the ones to focus, its `h1` is the title. */
  root: RefObject<HTMLElement>;
  /** Selector of the element to focus inside the element with the key. */
  target: string;
  /** True when the note changed. */
  onEdit: (edit: E) => Promise<boolean>;
}) {
  const follow = useRef<Follow | null>(null);
  const [said, setSaid] = useState("");
  const turn = useRef(0);
  const count = useRef(o.count);
  count.current = o.count;

  useEffect(() => {
    const f = follow.current;
    follow.current = null;
    if (!f) return;
    const root = o.root.current;
    if (f.focus !== "field") {
      const to = f.focus === "title" ? null : f.focus;
      const found =
        to === null
          ? null
          : Array.from(root?.querySelectorAll<HTMLElement>("[data-key]") ?? [])
              .find((r) => r.dataset.key === to.key)
              ?.querySelector<HTMLElement>(to.target ?? o.target);
      (found ?? root?.querySelector<HTMLElement>("h1"))?.focus({ preventScroll: true });
    }
    // The same words twice in a row are only read again when the text differs.
    setSaid(f.say(count.current) + (turn.current++ % 2 ? "​" : ""));
  }, [o.text]);

  /** Runs an edit; `how` says where the focus goes and what is announced once the note has changed. */
  const run = async (edit: E, how: Follow): Promise<boolean> => {
    follow.current = how;
    const changed = await o.onEdit(edit);
    if (!changed) follow.current = null;
    return changed;
  };
  return { said, run };
}
