// Which page is shown and how it changes: the one way to change it (`goPage`), requests of the host that count once,
// "/" from a page to the search, and the step of cooking mode that a page change interrupts.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { CLOSED_BY_PAGE_CHANGE, pendingGoTo, type GoTo, type Page } from "./pages";
import type { EscapeLayer } from "./keyboard";
import { tr } from "../i18n";

export function usePageNav(o: {
  initial: Page;
  goto?: GoTo;
  root: RefObject<HTMLElement>;
  onHint: (text: string) => void;
  cooking: { path: string; step: number } | null;
  setCooking: (c: { path: string; step: number } | null) => void;
  /** A dialog the user may have typed in is open (attempt, import): it is not closed without a word. */
  blocked: boolean;
  /** How each layer closes. */
  close: Partial<Record<EscapeLayer, () => void>>;
}) {
  const [page, setPage] = useState<Page>(o.initial);
  const resumeStep = useRef<Record<string, number>>({});
  const wantSearch = useRef(false);

  /** The one way to change the page: everything that lies above a page closes (see CLOSED_BY_PAGE_CHANGE). */
  const goPage = (pg: Page) => {
    if (o.blocked) {
      o.onHint(tr("closeDialogFirst"));
      return;
    }
    // Cooking mode may close; the step is kept and offered when the recipe is cooked again.
    if (o.cooking) resumeStep.current[o.cooking.path] = o.cooking.step;
    setPage(pg);
    for (const layer of CLOSED_BY_PAGE_CHANGE) o.close[layer]?.();
  };

  const startCooking = (path: string) => {
    const step = resumeStep.current[path] ?? 0;
    delete resumeStep.current[path];
    o.setCooking({ path, step });
    if (step > 0) o.onHint(tr("cookResumed", { n: step + 1 }));
  };

  // A request of the host counts once: a view built anew (the host renders from scratch) must not repeat it.
  const handled = useRef(o.goto?.id ?? 0);
  useEffect(() => {
    const pg = pendingGoTo(handled.current, o.goto);
    if (!pg || !o.goto) return;
    handled.current = o.goto.id;
    goPage(pg);
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
    startCooking,
    /** "/" was pressed: go to the overview and focus its search once it is there. */
    slash: () => {
      if (page !== "overview") wantSearch.current = true;
      goPage("overview");
    },
  };
}
