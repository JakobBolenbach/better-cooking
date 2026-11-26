import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { RecipeSearch, type Hit } from "../search";
import type { Job, ColorMode, Palette, RecipeView, Status, Theme } from "../types";
import { jobFailed, type ActiveProcessor } from "../processor";
import { ImportModal } from "./jobs";
import type { List } from "./shared";
import { categoriesOf, inList, jobsFor, listEntries, listName } from "./lists";
import { CookingMode, TimerBar } from "./cookingMode";
import { useTimers } from "./useTimers";
import { RecipePage } from "./recipePage";
import { ViewModal, Sidebar } from "./sidebar";
import { useKeyboard, type EscapeHandler } from "./useKeyboard";
import { dialogFor, type EscapeLayer } from "./keyboard";
import { Overview } from "./overview";
import { SubPage, type SubPageProps } from "./subPages";
import { CLOSED_BY_PAGE_CHANGE, pendingGoTo, type GoTo, type Page, type PlanDialog } from "./pages";
import { useShoppingUi } from "./shoppingUi";
import { openCount } from "../shoppingEdit";
import { type AttemptInput, AttemptModal } from "./attempt";
import { RecipeDialogs, type RecipeDialog } from "./recipeDialogs";
import { nextStep } from "../tapZones";
import { tr } from "../i18n";

export interface AppProps extends SubPageProps {
  recipes: RecipeView[];
  theme: Theme;
  mode: ColorMode;
  jobs: Job[];
  /** Which processor would handle a new job; null = none set up. */
  processor: ActiveProcessor | null;
  /** Why a social media link is locked (pill and hint) and whether the chosen processor is not fully set up. */
  status?: { short: string; long: string; notReady?: string };
  list?: string;
  /** Recipe folder from the settings, for the hint in the empty overview. */
  folder?: string;
  /** The recipe folder does not exist (the empty overview says so). */
  folderMissing?: boolean;
  /** For the preview: open a recipe directly. */
  start?: {
    recipe?: string;
    cooking?: boolean;
    importRecipe?: boolean;
    search?: string;
    attempt?: boolean;
    view?: boolean;
    page?: Page;
  };
  /** Shows a page when `id` changes (notice button of the host). */
  goto?: GoTo;
  onList: (list: string) => void;
  onMode: (m: ColorMode) => void;
  /** "obsidian": colors and light/dark follow the theme, so the mode switch is hidden. */
  palette?: Palette;
  onOpenNote: (path: string) => void;
  onStatus: (path: string, s: Status) => void;
  onRating: (path: string, n: number | null) => void;
  onMade: (path: string) => void;
  onUndoMade: (path: string) => void;
  onAttempt: (path: string, v: AttemptInput) => Promise<boolean>;
  onShop: (path: string, factor: number, skip: string[]) => void;
  canTranslate?: boolean;
  onTranslate?: (path: string, language: string) => Promise<{ ok: boolean; message?: string; path?: string }>;
  onImport: (input: string) => Promise<{ ok: boolean; message?: string }>;
  onJobGone: (id: string) => void;
  /** Start the job again (same input) and remove the old one. */
  onRetry: (id: string) => Promise<{ ok: boolean; message?: string }>;
  onHint: (text: string) => void;
  /** Desktop only: printing (and PDF) through the print dialog. */
  canPrint?: boolean;
  onKeepAwake: (an: boolean) => Promise<boolean>;
  /** One-time hint on the tap zones in cooking mode (issue #57). */
  tapHintSeen?: boolean;
  onTapHintSeen?: () => void;
  /**
   * Inside Obsidian the view handles Esc in its own key scope (a window listener runs too late, Obsidian
   * switches the tab first) and passes each press to the handler given here.
   * Without this prop (preview) the App listens for Esc on the window itself.
   */
  registerEscape?: (handle: EscapeHandler | null) => void;
}

// ---------------------------------------------------------------- App

export function App(p: AppProps) {
  const [list, setList] = useState<List>((p.list as List) || "alle");
  const [page, setPage] = useState<Page>(p.start?.page ?? "overview");
  const [planDialog, setPlanDialog] = useState<PlanDialog | null>(null);
  const [search, setSearch] = useState(p.start?.search ?? "");
  const [openPath, setOpenPathRaw] = useState<string | null>(p.start?.recipe ?? null);
  const [cooking, setCooking] = useState<{ path: string; step: number } | null>(
    p.start?.cooking && p.start.recipe ? { path: p.start.recipe, step: 0 } : null,
  );
  const [importOpen, setImportOpen] = useState(!!p.start?.importRecipe);
  const [viewOpen, setViewOpen] = useState(!!p.start?.view);
  const [dialog, setDialog] = useState<{ kind: RecipeDialog; path: string } | null>(null);
  const [attemptFor, setAttemptFor] = useState<string | null>(
    p.start?.attempt && p.start.recipe ? p.start.recipe : null,
  );
  const [servings, setServings] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const { timers, now, start: startTimer, pause: pauseTimer, dismiss: dismissTimer } = useTimers(p.onHint);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchIndex = useRef(new RecipeSearch());

  /** The one way to change the open recipe: a dialog belongs to the recipe page, so it goes with it. */
  const setOpenPath = (path: string | null) => {
    setOpenPathRaw(path);
    setDialog(null);
  };
  const shoppingUi = useShoppingUi();
  /** The one way to change the page: everything that lies above a page closes (see CLOSED_BY_PAGE_CHANGE). */
  const goPage = (pg: Page) => {
    const close: Partial<Record<EscapeLayer, () => void>> = {
      attempt: () => setAttemptFor(null),
      view: () => setViewOpen(false),
      import: () => setImportOpen(false),
      cooking: () => setCooking(null),
      recipe: () => setOpenPath(null),
      planDialog: () => setPlanDialog(null),
      ask: () => shoppingUi.setAsk(null),
      details: () => shoppingUi.setOpenRow(null),
    };
    setPage(pg);
    for (const layer of CLOSED_BY_PAGE_CHANGE) close[layer]?.();
  };
  // A request of the host counts once: a view built anew (the host renders from scratch) must not repeat it.
  const handledGoto = useRef(p.goto?.id ?? 0);
  useEffect(() => {
    const pg = pendingGoTo(handledGoto.current, p.goto);
    if (!pg || !p.goto) return;
    handledGoto.current = p.goto.id;
    goPage(pg);
  }, [p.goto?.id]);
  // "/" on a page: the search lives on the overview, which does not exist until the next render.
  const wantSearch = useRef(false);
  useEffect(() => {
    if (!wantSearch.current || page !== "overview") return;
    wantSearch.current = false;
    const fields = Array.from(rootRef.current?.querySelectorAll<HTMLInputElement>(".rz-suche input") ?? []);
    fields.find((i) => i.offsetParent)?.focus();
  }, [page]);

  const visible = useMemo(() => p.recipes, [p.recipes]);
  useMemo(() => searchIndex.current.reconcile(visible), [visible]);
  const byPath = useMemo(() => new Map(visible.map((r) => [r.path, r])), [visible]);
  const openRecipe = openPath ? byPath.get(openPath) : undefined;
  /** The original and its translations (issue #10); translations are not listed in the overview. */
  const originals = useMemo(() => visible.filter((r) => !r.translationOf), [visible]);
  const languagesOf = (r: RecipeView) => {
    const original = r.translationOf ? visible.find((x) => x.name === r.translationOf) : r;
    if (!original) return undefined;
    const family = [original, ...visible.filter((x) => x.translationOf === original.name)];
    return family.map((x) => ({ path: x.path, label: x.language ?? tr("originalLanguage") }));
  };
  const cookingRecipe = cooking ? byPath.get(cooking.path) : undefined;

  const dialogKind = openRecipe ? dialogFor(dialog, openPath) : null;
  useKeyboard({
    root: rootRef,
    searchRef,
    layers: {
      attempt: [!!(attemptFor && byPath.get(attemptFor)), () => setAttemptFor(null)],
      dialog: [!!dialogKind, () => setDialog(null)],
      view: [viewOpen, () => setViewOpen(false)],
      import: [importOpen, () => setImportOpen(false)],
      cooking: [!!(cooking && cookingRecipe), () => setCooking(null)],
      recipe: [!!openRecipe, () => setOpenPath(null)],
      ask: [page === "shopping" && !!shoppingUi.ask, () => shoppingUi.setAsk(null)],
      details: [page === "shopping" && !!shoppingUi.openRow, () => shoppingUi.setOpenRow(null)],
      planDialog: [!!planDialog && page === "plan", () => setPlanDialog(null)],
      page: [page !== "overview", () => goPage("overview")],
    },
    onClearSearch: () => setSearch(""),
    onSlash: () => {
      if (page !== "overview") wantSearch.current = true;
      goPage("overview");
    },
    onStep:
      cooking && cookingRecipe
        ? (d) => setCooking({ ...cooking, step: nextStep(d, cooking.step, cookingRecipe.steps.length) })
        : undefined,
    registerEscape: p.registerEscape,
  });

  const choose = (l: List) => {
    setList(l);
    setSearch("");
    goPage("overview");
    p.onList(l);
  };

  const categories = useMemo(() => categoriesOf(originals), [originals]);
  const { lists, discarded } = useMemo(() => listEntries(originals), [originals]);
  const inCurrentList = useMemo(() => inList(originals, visible, list), [originals, list]);

  const hits: Hit[] = useMemo(() => (search.trim() ? searchIndex.current.search(search) : []), [search, visible]);

  const retry = async (id: string) => {
    const r = await p.onRetry(id);
    if (!r.ok) p.onHint(r.message ?? tr("failed"));
  };
  const shoppingOpen = useMemo(() => openCount(p.shopping), [p.shopping]);
  const running = p.jobs.filter((a) => !jobFailed(a)).length;

  const faktorVon = (r: RecipeView) => {
    const base = r.servings?.count;
    const value = servings[r.path];
    if (!base) return value ?? 1; // no yield given: use the factor directly
    return (value ?? base) / base;
  };

  return (
    <div class="rz-app" ref={rootRef} tabIndex={-1}>
      <Sidebar
        lists={lists}
        categories={categories}
        discarded={discarded}
        active={search.trim() ? null : list}
        onList={choose}
        search={search}
        onSearch={(s) => {
          setSearch(s);
          goPage("overview");
        }}
        searchRef={searchRef}
        onImport={() => setImportOpen(true)}
        mode={p.mode}
        onMode={p.palette === "obsidian" ? undefined : p.onMode}
        jobs={p.jobs}
        page={page}
        onPage={goPage}
        shoppingOpen={shoppingOpen}
      />
      <main class="rz-haupt" aria-labelledby="rz-titel">
        {page !== "overview" ? (
          <SubPage
            {...p}
            page={page}
            recipes={originals}
            shoppingUi={shoppingUi}
            planDialog={planDialog}
            onPlanDialog={setPlanDialog}
            onRecipe={setOpenPath}
            onCook={(path) => setCooking({ path, step: 0 })}
            onBack={() => goPage("overview")}
          />
        ) : (
          <Overview
            title={search.trim() ? tr("search") : listName(list, lists)}
            list={list}
            lists={lists}
            categories={categories}
            discarded={discarded}
            recipes={
              search.trim() ? hits.map((t) => byPath.get(t.path)).filter((x): x is RecipeView => !!x) : inCurrentList
            }
            hits={search.trim() ? hits : null}
            search={search}
            onSearch={(s) => setSearch(s)}
            searchRef={searchRef}
            onList={choose}
            onRecipe={setOpenPath}
            onImport={() => setImportOpen(true)}
            jobs={jobsFor(list, search, p.jobs)}
            running={running}
            onJobGone={p.onJobGone}
            onRetry={retry}
            onView={() => setViewOpen(true)}
            total={visible.length}
            folder={p.folder}
            folderMissing={p.folderMissing}
          />
        )}
      </main>

      <div class={`rz-detail-ebene${openRecipe ? " offen" : ""}`} aria-hidden={!openRecipe}>
        {openRecipe && (
          <RecipePage
            key={openRecipe.path}
            r={openRecipe}
            theme={p.theme}
            faktor={faktorVon(openRecipe)}
            serving={servings[openRecipe.path]}
            onServing={(n) => setServings({ ...servings, [openRecipe.path]: n })}
            checked={checked[openRecipe.path] ?? []}
            onCheck={(k) => {
              const old = checked[openRecipe.path] ?? [];
              setChecked({
                ...checked,
                [openRecipe.path]: old.includes(k) ? old.filter((x) => x !== k) : [...old, k],
              });
            }}
            onBack={() => setOpenPath(null)}
            onCook={() => setCooking({ path: openRecipe.path, step: 0 })}
            onTimer={(t, s) => startTimer(t, openRecipe.title, s)}
            onStatus={(s) => p.onStatus(openRecipe.path, s)}
            onRating={(n) => p.onRating(openRecipe.path, n)}
            onMade={() => p.onMade(openRecipe.path)}
            onUndoMade={() => p.onUndoMade(openRecipe.path)}
            onAttempt={() => setAttemptFor(openRecipe.path)}
            onShop={(factor, skip) => p.onShop(openRecipe.path, factor, skip)}
            onOpenNote={() => p.onOpenNote(openRecipe.path)}
            onShare={() => openRecipe && setDialog({ kind: "share", path: openRecipe.path })}
            onPlan={() => openRecipe && setDialog({ kind: "plan", path: openRecipe.path })}
            onTranslate={
              p.canTranslate && p.onTranslate
                ? () => setDialog({ kind: "translate", path: openRecipe.path })
                : undefined
            }
            languages={languagesOf(openRecipe)}
            onOpen={(path) => setOpenPath(path)}
          />
        )}
      </div>

      {cookingRecipe && cooking && (
        <CookingMode
          r={cookingRecipe}
          step={cooking.step}
          faktor={faktorVon(cookingRecipe)}
          onStep={(s) => setCooking({ ...cooking, step: s })}
          onCloseView={() => setCooking(null)}
          onTimer={(t, s) => startTimer(t, cookingRecipe.title, s)}
          onAttempt={() => {
            setCooking(null);
            setOpenPath(cookingRecipe.path);
            setAttemptFor(cookingRecipe.path);
          }}
          onKeepAwake={p.onKeepAwake}
          tapHintSeen={p.tapHintSeen}
          onTapHintSeen={p.onTapHintSeen}
        />
      )}

      {timers.length > 0 && <TimerBar timers={timers} now={now} onPause={pauseTimer} onDismiss={dismissTimer} />}

      {importOpen && (
        <ImportModal
          recipes={visible}
          jobs={p.jobs}
          processor={p.processor}
          status={p.status}
          onImport={p.onImport}
          onCloseView={() => setImportOpen(false)}
          onOpenNote={(path) => {
            setImportOpen(false);
            setOpenPath(path);
          }}
          onJobGone={p.onJobGone}
          onRetry={retry}
        />
      )}

      {viewOpen && (
        <ViewModal
          lists={lists}
          categories={categories}
          discarded={discarded}
          active={search.trim() ? null : list}
          onList={(l) => {
            choose(l);
            setViewOpen(false);
          }}
          mode={p.mode}
          onMode={p.palette === "obsidian" ? undefined : p.onMode}
          onImport={() => {
            setViewOpen(false);
            setImportOpen(true);
          }}
          running={running}
          page={page}
          onPage={goPage}
          shoppingOpen={shoppingOpen}
          onCloseView={() => setViewOpen(false)}
        />
      )}

      {dialogKind && openRecipe && (
        <RecipeDialogs
          dialog={dialogKind}
          r={openRecipe}
          factor={faktorVon(openRecipe)}
          canPrint={!!p.canPrint}
          onHint={p.onHint}
          onPlan={p.onPlan}
          onTranslate={p.onTranslate}
          onOpen={setOpenPath}
          onClose={() => setDialog(null)}
        />
      )}
      {attemptFor && byPath.get(attemptFor) && (
        <AttemptModal
          r={byPath.get(attemptFor)!}
          onCloseView={() => setAttemptFor(null)}
          onSave={async (v) => {
            const ok = await p.onAttempt(attemptFor, v);
            if (ok) setAttemptFor(null);
          }}
        />
      )}
    </div>
  );
}
