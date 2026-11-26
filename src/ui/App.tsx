import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { RecipeSearch, type Hit } from "../search";
import type { Job, ColorMode, Palette, RecipeView, Status, Theme } from "../types";
import { jobFailed, type ActiveProcessor } from "../processor";
import type { Kind } from "../source";
import type { SocialRoute } from "../socialFlow";
import { ImportModal } from "./jobs";
import type { List } from "./shared";
import { categoriesOf, inList, jobsFor, languagesOf, listEntries, listName } from "./lists";
import { CookingMode, TimerBar } from "./cookingMode";
import { useTimers } from "./useTimers";
import { RecipeLayer } from "./recipeLayer";
import { useRecipeInputs } from "./recipeInputs";
import { ViewModal, Sidebar } from "./sidebar";
import { useKeyboard, type EscapeHandler } from "./useKeyboard";
import { dialogFor } from "./keyboard";
import { Overview } from "./overview";
import { SubPage, type SubPageProps } from "./subPages";
import { blocksPageChange, type GoTo, type Page } from "./pages";
import { usePlanUi } from "./planUi";
import { usePageNav } from "./usePageNav";
import { useShoppingUi } from "./shoppingUi";
import { openCount, rowExists } from "../shoppingEdit";
import { type AttemptInput, AttemptModal } from "./attempt";
import { RecipeDialogs, type RecipeDialog } from "./recipeDialogs";
import { nextStep } from "../tapZones";
import { language, tr } from "../i18n";
import type { RefetchApi } from "./refetchModal";

export interface AppProps extends SubPageProps {
  recipes: RecipeView[];
  theme: Theme;
  mode: ColorMode;
  jobs: Job[];
  /** Which processor would handle a new job; null = none set up. */
  processor: ActiveProcessor | null;
  /** The way for a social media link (read by the plugin, processor, or locked for Facebook). */
  route?: (kind: Kind) => SocialRoute | null;
  /** Why a link that needs a processor is locked (pill and hint) and whether the chosen processor is not fully set up. */
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
  /** Fetch again (issue #63): read the source and say what would change; then write it. Unset without a plugin. */
  /** "Fetch again" (issue #63); unset without a plugin. */
  refetch?: RefetchApi;
  onImport: (input: string) => Promise<{ ok: boolean; message?: string }>;
  onJobGone: (id: string) => void;
  /** Start the job again (same input) and remove the old one. */
  onRetry: (id: string) => Promise<{ ok: boolean; message?: string }>;
  /** A notice; with an action it has a button. */
  onHint: (text: string, action?: { label: string; run: () => void }) => void;
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
  const planUi = usePlanUi();
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
  const inputs = useRecipeInputs();
  const { faktorVon } = inputs;
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
  // An opened item whose line is gone (the note changed) is no layer any more.
  const openRowShown = useMemo(() => rowExists(p.shopping, shoppingUi.openRow), [p.shopping, shoppingUi.openRow]);
  /** Whether the attempt and import dialogs hold text of the user's (they report it). */
  const dirty = useRef({ attempt: false, import: false });
  const { page, goPage, startCooking, slash } = usePageNav({
    initial: p.start?.page ?? "overview",
    goto: p.goto,
    root: rootRef,
    onHint: p.onHint,
    stepCount: (path) => byPath.get(path)?.steps.length,
    cooking,
    setCooking,
    blocked: () =>
      blocksPageChange({
        attempt: {
          open: !!attemptFor,
          recipeExists: !!attemptFor && byPath.has(attemptFor),
          dirty: dirty.current.attempt,
        },
        import: { open: importOpen, dirty: dirty.current.import },
      }),
    close: {
      attempt: () => setAttemptFor(null),
      view: () => setViewOpen(false),
      import: () => setImportOpen(false),
      cooking: () => setCooking(null),
      recipe: () => setOpenPath(null),
      planDialog: () => planUi.setDialog(null),
      undo: () => planUi.setUndo(null),
      ask: () => shoppingUi.setAsk(null),
      details: () => shoppingUi.setOpenRow(null),
    },
  });

  const visible = useMemo(() => p.recipes, [p.recipes]);
  useMemo(() => searchIndex.current.reconcile(visible), [visible]);
  const byPath = useMemo(() => new Map(visible.map((r) => [r.path, r])), [visible]);
  // An attempt dialog whose recipe is gone is no longer shown: forget it, so it blocks nothing.
  useEffect(() => {
    if (attemptFor && !byPath.has(attemptFor)) setAttemptFor(null);
  }, [attemptFor, byPath]);
  const openRecipe = openPath ? byPath.get(openPath) : undefined;
  /** The original and its translations (issue #10); translations are not listed in the overview. */
  const originals = useMemo(() => visible.filter((r) => !r.translationOf), [visible]);
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
      details: [page === "shopping" && openRowShown, () => shoppingUi.setOpenRow(null)],
      planDialog: [!!planUi.dialog && page === "plan", () => planUi.setDialog(null)],
      undo: [!!planUi.undo && page === "plan", () => planUi.setUndo(null)],
      page: [page !== "overview", () => goPage("overview")],
    },
    onClearSearch: () => setSearch(""),
    onSlash: slash,
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

  // Texts built here depend on the interface language, so it is a dependency (no remount: timers, dialogs and the open recipe stay).
  const lang = language();
  const categories = useMemo(() => categoriesOf(originals), [originals, lang]);
  const { lists, discarded } = useMemo(() => listEntries(originals), [originals, lang]);
  const inCurrentList = useMemo(() => inList(originals, visible, list), [originals, list]);

  const hits: Hit[] = useMemo(() => (search.trim() ? searchIndex.current.search(search) : []), [search, visible]);

  const retry = async (id: string) => {
    const r = await p.onRetry(id);
    if (!r.ok) p.onHint(r.message ?? tr("failed"));
  };
  const shoppingOpen = useMemo(() => openCount(p.shopping), [p.shopping]);
  const running = p.jobs.filter((a) => !jobFailed(a)).length;

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
            recipes={visible}
            originals={originals}
            searchPaths={(q) => searchIndex.current.search(q).map((h) => h.path)}
            shoppingUi={shoppingUi}
            planUi={planUi}
            onRecipe={setOpenPath}
            onCook={startCooking}
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
          <RecipeLayer
            r={openRecipe}
            host={p}
            inputs={inputs}
            languages={languagesOf(visible, openRecipe)}
            onBack={() => setOpenPath(null)}
            onCook={() => startCooking(openRecipe.path)}
            onTimer={startTimer}
            onAttempt={() => setAttemptFor(openRecipe.path)}
            onDialog={(kind) => setDialog({ kind, path: openRecipe.path })}
            onOpen={setOpenPath}
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
          onDirty={(d) => (dirty.current.import = d)}
          recipes={visible}
          jobs={p.jobs}
          processor={p.processor}
          status={p.status}
          route={p.route}
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
          refetch={p.refetch}
          onOpen={setOpenPath}
          onClose={() => setDialog(null)}
        />
      )}
      {attemptFor && byPath.get(attemptFor) && (
        <AttemptModal
          onDirty={(d) => (dirty.current.attempt = d)}
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
