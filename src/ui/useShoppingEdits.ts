// What the shopping list page does with its items: add, tick, remove, remove a recipe's items, clear the done ones.
// Each edit says where the focus goes and what is announced (src/ui/useEditFollow.ts).
import type { RefObject } from "preact";
import { useRef } from "preact/hooks";
import { rowKey, type ShoppingEdit, type ShoppingRow, type ShoppingView } from "../shoppingEdit";
import { useEditFollow, type Follow } from "./useEditFollow";
import type { ShoppingUi } from "./shoppingUi";
import { tr } from "../i18n";
import type { Contributions } from "../listRecipes";

/** The row after `row` in `rows` (the next one to look at when `row` leaves its place), as it is keyed after the edit. */
function nextKey(rows: ShoppingRow[], row: ShoppingRow): string | undefined {
  const next = rows[rows.indexOf(row) + 1];
  if (!next) return undefined;
  // An identical line before it that goes away (or changes) moves its number up by one.
  const shift = next.raw === row.raw && next.nth > row.nth ? 1 : 0;
  return rowKey({ raw: next.raw, nth: next.nth - shift });
}

/** Focus target: the row, or the page title when there is none. */
const nextRow = (key?: string): Follow["focus"] => (key ? { key } : "title");

export function useShoppingEdits(o: {
  text: string;
  view: ShoppingView;
  root: RefObject<HTMLElement>;
  ui: ShoppingUi;
  showDone: boolean;
  draft: string;
  known?: Contributions;
  setDraft: (s: string) => void;
  /** Resolves to true when the note changed. */
  onEdit: (edit: ShoppingEdit) => Promise<boolean>;
}) {
  const { view, ui } = o;
  const draftNow = useRef(o.draft);
  draftNow.current = o.draft;
  const { said, run } = useEditFollow<ShoppingEdit>({
    text: o.text,
    count: view.open,
    root: o.root,
    target: ".rz-ek-haken",
    onEdit: o.onEdit,
  });
  const listOf = (r: ShoppingRow) => (r.checked ? view.done : view.groups.flatMap((g) => g.rows));

  return {
    said,
    add: async () => {
      const sent = o.draft;
      const changed = await run(
        { kind: "add", text: sent },
        { focus: "field", say: (n) => tr("shoppingAnnounceAdded", { name: sent.trim(), n }) },
      );
      // The text stays when writing failed, and when the user has typed on in the meantime.
      if (changed && draftNow.current === sent) o.setDraft("");
    },
    check: (r: ShoppingRow) => {
      const name = [r.amount, r.name].filter(Boolean).join(" ");
      ui.setOpenRow(null);
      void run(
        { kind: "check", raw: r.raw, nth: r.nth, checked: !r.checked },
        {
          focus: nextRow(o.showDone || !r.checked ? nextKey(listOf(r), r) : undefined),
          say: (n) => tr(r.checked ? "shoppingAnnounceOpen" : "shoppingAnnounceDone", { name, n }),
        },
      );
    },
    remove: (r: ShoppingRow) => {
      ui.setOpenRow(null);
      void run(
        { kind: "remove", raw: r.raw, nth: r.nth },
        { focus: nextRow(nextKey(listOf(r), r)), say: (n) => tr("shoppingAnnounceRemoved", { name: r.name, n }) },
      );
    },
    removeRecipe: (recipe: string) => {
      ui.setAsk(null);
      void run(
        { kind: "removeRecipe", recipe, known: o.known },
        { focus: "title", say: (n) => tr("shoppingAnnounceRecipe", { recipe, n }) },
      );
    },
    clearDone: () =>
      void run({ kind: "clearDone" }, { focus: "title", say: (n) => tr("shoppingAnnounceCleared", { n }) }),
  };
}
