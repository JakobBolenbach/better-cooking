import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { RecipeSearch, type Hit } from "../search";
import type { RecipeView } from "../types";
import { jobFailed } from "../processor";
import { ImportModal } from "./jobs";
import type { List } from "./shared";
import { categoriesOf, inList, jobsFor, languagesOf, listEntries, listName, originalsOf } from "./lists";
import { CookingMode } from "./cookingMode";
import { TimerBar } from "./timerBar";
import { RecipeLayer } from "./recipeLayer";
import { useRecipeInputs } from "./recipeInputs";
import { ViewModal, Sidebar } from "./sidebar";
import { useKeyboard } from "./useKeyboard";
import { dialogFor } from "./keyboard";
import { Overview } from "./overview";
import { SubPage } from "./subPages";
import { blocksPageChange } from "./pages";
import { usePlanUi } from "./planUi";
import { usePageNav } from "./usePageNav";
import { useCookingResume } from "./useCookingResume";
import { useShoppingUi } from "./shoppingUi";
import { openCount, rowExists } from "../shoppingEdit";
import { AttemptModal } from "./attempt";
import { RecipeDialogs, type RecipeDialog } from "./recipeDialogs";
import { nextStep } from "../tapZones";
import { language, tr } from "../i18n";
import type { AppProps } from "./appProps";
import type { JobActions } from "./jobActions";

export type { AppProps };

// ---------------------------------------------------------------- App

export function App(p: AppProps) {
  const [list, setList] = useState<List>((p.list as List) || "alle");
  const planUi = usePlanUi();
  const [search, setSearch] = useState(p.start?.search ?? "");
  const [openPath, setOpenPathRaw] = useState<string | null>(p.start?.recipe ?? null);
  const { cooking, setCooking, startCooking, stepTo } = useCookingResume({
    resume: p.resume,
    recipes: p.recipes,
    initialPath: p.start?.cooking ? p.start.recipe : undefined,
  });
  const [importOpen, setImportOpen] = useState(!!p.start?.importRecipe);
  const [viewOpen, setViewOpen] = useState(!!p.start?.view);
  const [dialog, setDialog] = useState<{ kind: RecipeDialog; path: string } | null>(null);
  const [attemptFor, setAttemptFor] = useState<string | null>(
    p.start?.attempt && p.start.recipe ? p.start.recipe : null,
  );
  const inputs = useRecipeInputs();
  const { faktorVon } = inputs;
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
  const dirty = useRef({ attempt: false, import: false, edit: false });
  /** The recipe editor answers Esc itself while it has unsaved changes (it asks first). */
  const editGuard = useRef<(() => boolean) | null>(null);
  const { page, goPage, slash } = usePageNav({
    initial: p.start?.page ?? "overview",
    goto: p.goto,
    root: rootRef,
    onHint: p.onHint,
    openRecipe: (path) => setOpenPath(path),
    blocked: () =>
      blocksPageChange({
        attempt: {
          open: !!attemptFor,
          recipeExists: !!attemptFor && byPath.has(attemptFor),
          dirty: dirty.current.attempt,
        },
        import: { open: importOpen, dirty: dirty.current.import },
        edit: { open: dialog?.kind === "edit", dirty: dirty.current.edit },
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
  // An open recipe that is gone (deleted) takes its page and dialog with it; a new note under the same path does not
  // bring them back. A recipe that was never there (opened by a link before the list was read) stays.
  const seenOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!openPath) seenOpen.current = null;
    else if (byPath.has(openPath)) seenOpen.current = openPath;
    else if (seenOpen.current === openPath) {
      seenOpen.current = null;
      setOpenPath(null);
    }
  }, [openPath, byPath]);
  // The open recipe is renamed (the host says so): the page follows it to its new path instead of closing.
  const handledRename = useRef(p.renamed?.id ?? 0);
  useEffect(() => {
    const r = p.renamed;
    if (!r || r.id === handledRename.current) return;
    handledRename.current = r.id;
    // Not seen under the new path yet: until the list is read again the page waits for it instead of closing.
    if (seenOpen.current === r.from) seenOpen.current = null;
    setOpenPathRaw((now) => (now === r.from ? r.to : now));
    setDialog((d) => (d?.path === r.from ? { ...d, path: r.to } : d));
  }, [p.renamed?.id]);
  const openRecipe = openPath ? byPath.get(openPath) : undefined;
  /** The original and its translations (issue #10); translations are not listed in the overview, unless the original is gone (#119). */
  const originals = useMemo(() => originalsOf(visible), [visible]);
  const cookingRecipe = cooking ? byPath.get(cooking.path) : undefined;

  const dialogKind = openRecipe ? dialogFor(dialog, openPath) : null;
  useKeyboard({
    root: rootRef,
    searchRef,
    layers: {
      attempt: [!!(attemptFor && byPath.get(attemptFor)), () => setAttemptFor(null)],
      dialog: [!!dialogKind, () => editGuard.current?.() || setDialog(null)],
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
    onStep: cooking && cookingRecipe ? (d) => stepTo(nextStep(d, cooking.step, cookingRecipe.steps.length)) : undefined,
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

  const actions: JobActions = {
    ...p.jobActions,
    onRetry: async (id) => {
      const r = await p.jobActions.onRetry(id);
      if (!r.ok) p.onHint(r.message ?? tr("failed"));
    },
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
            actions={actions}
            failures={jobsFor(list, search, p.failures ?? [])}
            onOpenNote={p.onOpenNote}
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
            onTimer={(t, s) => p.timers.start(t, openRecipe.path, s, openRecipe.title)}
            onAttempt={() => setAttemptFor(openRecipe.path)}
            onDialog={(kind) => setDialog({ kind, path: openRecipe.path })}
            onOpen={setOpenPath}
            menuOpen={dialogKind === "menu"}
            onMenu={(open) => setDialog(open ? { kind: "menu", path: openRecipe.path } : null)}
          />
        )}
      </div>

      {cookingRecipe && cooking && (
        <CookingMode
          r={cookingRecipe}
          step={cooking.step}
          faktor={faktorVon(cookingRecipe)}
          onStep={stepTo}
          resumed={cooking.resumed}
          onCloseView={() => setCooking(null)}
          onTimer={(t, s) => p.timers.start(t, cookingRecipe.path, s, cookingRecipe.title)}
          onAttempt={() => {
            setCooking(null);
            setOpenPath(cookingRecipe.path);
            setAttemptFor(cookingRecipe.path);
          }}
          onKeepAwake={p.onKeepAwake}
          tapHintSeen={p.tapHintSeen}
          touch={p.touch}
          onTapHintSeen={p.onTapHintSeen}
        />
      )}

      <TimerBar api={p.timers} />

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
          actions={actions}
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
          deleteRecipe={p.deleteRecipe}
          edit={
            p.edit && {
              api: p.edit,
              categories: categories.map(([name]) => name),
              translations: !openRecipe.translationOf && (languagesOf(visible, openRecipe)?.length ?? 0) > 1,
              guard: editGuard,
            }
          }
          onEditDirty={(d) => (dirty.current.edit = d)}
          onEdited={(path, saved) => saved.stepsChanged && p.resume?.forget(path)}
          onStatus={p.onStatus}
          onDeleted={(paths) => {
            setOpenPathRaw((now) => (now && paths.includes(now) ? null : now));
            setDialog((d) => (d && paths.includes(d.path) ? null : d));
            paths.forEach((path) => p.resume?.forget(path));
          }}
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
