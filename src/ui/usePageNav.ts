// Which page is shown and how it changes: the one way to change it (`goPage`), requests of the host that count once,
// and "/" from a page to the search.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { CLOSED_BY_PAGE_CHANGE, pendingGoTo, type GoTo, type Page } from "./pages";
import type { EscapeLayer } from "./keyboard";
import { tr } from "../i18n";

export function usePageNav(o: {
  initial: Page;
  goto?: GoTo;
  root: RefObject<HTMLElement>;
  onHint: (text: string, action?: { label: string; run: () => void }) => void;
  /** A dialog with text of the user's is open (see blocksPageChange): the page waits until it is closed. */
  blocked: () => boolean;
  /** Open a recipe (the host asked for it together with a page). */
  openRecipe?: (path: string) => void;
  /** How each layer closes. */
  close: Partial<Record<EscapeLayer, () => void>>;
}) {
  const [page, setPage] = useState<Page>(o.initial);
  const wantSearch = useRef(false);

  /** The one way to change the page: everything that lies above a page closes (see CLOSED_BY_PAGE_CHANGE). */
  const goPage = (pg: Page): boolean => {
    if (o.blocked()) {
      o.onHint(tr("closeDialogFirst"));
      return false;
    }
    setPage(pg);
    for (const layer of CLOSED_BY_PAGE_CHANGE) o.close[layer]?.();
    return true;
  };

  // A request of the host counts once: a view built anew (the host renders from scratch) must not repeat it.
  const handled = useRef(o.goto?.id ?? 0);
  useEffect(() => {
    const pg = pendingGoTo(handled.current, o.goto);
    if (!pg || !o.goto) return;
    handled.current = o.goto.id;
    if (goPage(pg) && o.goto.recipe) o.openRecipe?.(o.goto.recipe);
  }, [o.goto?.id]);

  // "/" on a page: the search lives on the overview, which does not exist until the next render.
  useEffect(() => {
    if (!wantSearch.current || page !== "overview") return;
    wantSearch.current = false;
    const fields = Array.from(o.root.current?.querySelectorAll<HTMLInputElement>(".rz-suche input") ?? []);
    fields.find((i) => i.offsetParent)?.focus();
  }, [page]);

  return {
    page,
    goPage,
    /** "/" was pressed: go to the overview and focus its search once it is there. */
    slash: () => {
      if (page !== "overview") wantSearch.current = true;
      goPage("overview");
    },
  };
}
