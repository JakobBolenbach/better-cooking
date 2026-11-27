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
  // The menu was left by something outside the view (another pane, another window): the focus is not taken back then.
  const left = useRef(false);
  // A press inside the view but outside the menu closes it and does nothing else: the page behind never gets the press
  // or the click that ends it (a backdrop in the toolbar would only cover the toolbar). A press elsewhere in the
  // window only closes the menu. Leaving the view in other ways (focus in another pane, hidden tab, window blur) closes it too.
  useEffect(() => {
    if (!p.open) return;
    left.current = false;
    const doc = wrap.current?.ownerDocument;
    const win = doc?.defaultView;
    const view = wrap.current?.closest(".rz-root");
    if (!doc || !win) return;
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const outside = (t: EventTarget | null) => !!view && !view.contains(t as Node);
    const leave = () => {
      left.current = true;
      p.onOpen(false);
    };
    const away = (e: Event) => {
      const down = e as PointerEvent;
      if (wrap.current?.contains(down.target as Node)) return;
      if (outside(down.target)) return leave();
      swallow(e);
      p.onOpen(false);
      // The click that ends this press comes right after its pointerup (same pointer): swallow that one, nothing later.
      const end = (up: Event) => {
        if ((up as PointerEvent).pointerId !== down.pointerId) return;
        doc.removeEventListener("pointerup", end, true);
        doc.removeEventListener("pointercancel", end, true);
        if (up.type !== "pointerup") return;
        doc.addEventListener("click", swallow, { capture: true, once: true });
        win.setTimeout(() => doc.removeEventListener("click", swallow, { capture: true }), 0);
      };
      doc.addEventListener("pointerup", end, true);
      doc.addEventListener("pointercancel", end, true);
    };
    const focus = (e: Event) => outside(e.target) && leave();
    const hidden = () => doc.visibilityState === "hidden" && leave();
    doc.addEventListener("pointerdown", away, true);
    doc.addEventListener("focusin", focus, true);
    doc.addEventListener("visibilitychange", hidden);
    win.addEventListener("blur", leave);
    return () => {
      doc.removeEventListener("pointerdown", away, true);
      doc.removeEventListener("focusin", focus, true);
      doc.removeEventListener("visibilitychange", hidden);
      win.removeEventListener("blur", leave);
    };
  }, [p.open]);
  useEffect(() => {
    if (!p.open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    // Closed by Esc, a click outside or a choice: the focus goes back to the button unless it moved on to a dialog.
    const node = list.current;
    return () => {
      const active = node?.ownerDocument.activeElement;
      if (!left.current && (!active || active === node?.ownerDocument.body || node?.contains(active)))
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
