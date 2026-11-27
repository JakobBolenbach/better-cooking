// The "⋯" menu of the recipe page (issue #119): the less frequent actions. A button with a menu that opens below it;
// the first item has the focus, arrow keys, Home and End move, Tab and a click outside close it. Esc is handled by
// the App (the menu is one of the recipe's dialogs there, so Esc closes the topmost layer only).
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Icon, type IconName } from "./icons";
import { tr } from "../i18n";

export interface MenuItem {
  id: string;
  label: string;
  icon: IconName;
  run: () => void;
  /** Destructive: set apart and in the danger color. */
  danger?: boolean;
}

export function RecipeMenu(p: { open: boolean; items: MenuItem[]; onOpen: (open: boolean) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // A press outside closes the menu and does nothing else: the page behind never gets the click that closed it.
  // (A backdrop inside the toolbar would only cover the toolbar.)
  useEffect(() => {
    if (!p.open) return;
    const doc = wrap.current?.ownerDocument;
    if (!doc) return;
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const away = (e: Event) => {
      if (wrap.current?.contains(e.target as Node)) return;
      swallow(e);
      p.onOpen(false);
      // The click that follows this press is swallowed too (once), unless none comes.
      doc.addEventListener("click", swallow, { capture: true, once: true });
      doc.defaultView?.setTimeout(() => doc.removeEventListener("click", swallow, { capture: true }), 400);
    };
    doc.addEventListener("pointerdown", away, true);
    return () => doc.removeEventListener("pointerdown", away, true);
  }, [p.open]);
  useEffect(() => {
    if (!p.open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    // Closed by Esc, a click outside or a choice: the focus goes back to the button unless it moved on to a dialog.
    const node = list.current;
    return () => {
      const active = node?.ownerDocument.activeElement;
      if (!active || active === node?.ownerDocument.body || node?.contains(active))
        button.current?.focus({ preventScroll: true });
    };
  }, [p.open]);
  const move = (e: KeyboardEvent) => {
    if (e.key === "Tab") return p.onOpen(false);
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(e.target as HTMLElement);
    const to =
      e.key === "ArrowDown"
        ? (at + 1) % items.length
        : e.key === "ArrowUp"
          ? (at - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to]?.focus({ preventScroll: true });
  };
  return (
    <div class="rz-menue-wrap" ref={wrap}>
      <button
        ref={button}
        type="button"
        class="rz-symbol"
        aria-label={tr("moreActions")}
        title={tr("moreActions")}
        aria-haspopup="menu"
        aria-expanded={p.open}
        onClick={() => p.onOpen(!p.open)}
      >
        <Icon n="mehr" />
      </button>
      {p.open && (
        <>
          <div class="rz-menue" role="menu" aria-label={tr("moreActions")} ref={list} onKeyDown={move}>
            {p.items.map((item, i) => (
              <Fragment key={item.id}>
                {item.danger && i > 0 && <div class="rz-menue-trenner" role="separator" />}
                <button
                  type="button"
                  role="menuitem"
                  class={`rz-menue-punkt${item.danger ? " gefahr" : ""}`}
                  onClick={() => {
                    p.onOpen(false);
                    item.run();
                  }}
                >
                  <Icon n={item.icon} large={18} />
                  {item.label}
                </button>
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
