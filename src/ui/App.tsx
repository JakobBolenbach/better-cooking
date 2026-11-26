import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { RecipeSearch, type Hit } from "../search";
import type { Job, ColorMode, Palette, RecipeView, Status, Theme } from "../types";
import type { ActiveProcessor } from "../processor";
import { ImportModal } from "./jobs";
import type { List, TimerEngine } from "./shared";
import type { IconName } from "./icons";
import { ring, CookingMode, TimerBar } from "./cookingMode";
import { RecipePage } from "./recipePage";
import { ViewModal, Sidebar } from "./sidebar";
import { useKeyboard } from "./useKeyboard";
import { Overview } from "./overview";
import { type AttemptInput, AttemptModal } from "./attempt";
import { RecipeDialogs, type RecipeDialog } from "./recipeDialogs";
import { tr } from "../i18n";

export interface AppProps {
  recipes: RecipeView[];
  theme: Theme;
  mode: ColorMode;
  jobs: Job[];
  /** Which processor would handle a new job; null = none set up. */
  processor: ActiveProcessor | null;
  list?: string;
  /** Recipe folder from the settings, for the hint in the empty overview. */
  folder?: string;
  /** For the preview: open a recipe directly. */
  start?: {
    recipe?: string;
    cooking?: boolean;
    importRecipe?: boolean;
    search?: string;
    attempt?: boolean;
    view?: boolean;
  };
  onList: (list: string) => void;
  onMode: (m: ColorMode) => void;
  /** "obsidian": colors and light/dark follow the theme, so the mode switch is hidden. */
  palette?: Palette;
  onOpenNote: (path: string) => void;
  onStatus: (path: string, s: Status) => void;
  onRating: (path: string, n: number | null) => void;
  onMade: (path: string) => void;
  onAttempt: (path: string, v: AttemptInput) => Promise<boolean>;
  onShop: (path: string, factor: number, skip: string[]) => void;
  onPlan: (path: string, date: string, factor: number) => void;
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
  /**
   * Inside Obsidian the view handles Esc in its own key scope (the window listener runs too late, Obsidian
   * switches the tab first). It receives a function that closes the top layer and says whether it did.
   * Without this prop (preview) the App listens for Esc on the window itself.
   */
  registerEscape?: (close: (() => boolean) | null) => void;
}

// ---------------------------------------------------------------- App

export function App(p: AppProps) {
  const [list, setList] = useState<List>((p.list as List) || "alle");
  const [search, setSearch] = useState(p.start?.search ?? "");
  const [openPath, setOpenPath] = useState<string | null>(p.start?.recipe ?? null);
  const [cooking, setCooking] = useState<{ path: string; step: number } | null>(
    p.start?.cooking && p.start.recipe ? { path: p.start.recipe, step: 0 } : null,
  );
  const [importOpen, setImportOpen] = useState(!!p.start?.importRecipe);
  const [viewOpen, setViewOpen] = useState(!!p.start?.view);
  const [dialog, setDialog] = useState<RecipeDialog | null>(null);
  const [attemptFor, setAttemptFor] = useState<string | null>(
    p.start?.attempt && p.start.recipe ? p.start.recipe : null,
  );
  const [servings, setServings] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [timers, setTimers] = useState<TimerEngine[]>([]);
  const [now, setNow] = useState(Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchIndex = useRef(new RecipeSearch());

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

  // Timers: once per second, only while one is running.
  useEffect(() => {
    if (!timers.some((u) => !u.done && u.rest === undefined)) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [timers]);
  useEffect(() => {
    const done = timers.filter((u) => !u.done && u.rest === undefined && u.end <= now);
    if (!done.length) return;
    setTimers((old) => old.map((u) => (done.some((f) => f.id === u.id) ? { ...u, done: true } : u)));
    for (const f of done) {
      p.onHint(tr("timerDone", { title: f.title, recipe: f.recipe }));
      ring();
    }
  }, [now]);

  // A dialog belongs to the recipe page: it goes away when the page closes or another recipe opens.
  useEffect(() => setDialog(null), [openPath]);

  useKeyboard({
    root: rootRef,
    searchRef,
    layers: {
      attempt: [!!attemptFor, () => setAttemptFor(null)],
      dialog: [!!dialog, () => setDialog(null)],
      view: [viewOpen, () => setViewOpen(false)],
      import: [importOpen, () => setImportOpen(false)],
      cooking: [!!cooking, () => setCooking(null)],
      recipe: [!!openPath, () => setOpenPath(null)],
    },
    slashOk: !cooking && !importOpen,
    onSlash: () => setOpenPath(null),
    onStep:
      cooking && cookingRecipe
        ? (d) => setCooking({ ...cooking, step: Math.max(0, Math.min(cookingRecipe.steps.length, cooking.step + d)) })
        : undefined,
    registerEscape: p.registerEscape,
  });

  const choose = (l: List) => {
    setList(l);
    setSearch("");
    setOpenPath(null);
    p.onList(l);
  };

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of originals)
      if (r.category && r.status !== "verworfen") m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [originals]);

  const count = (f: (r: RecipeView) => boolean) => originals.filter(f).length;
  const lists: { id: List; name: string; icon: IconName; count: number }[] = [
    { id: "alle", name: tr("listAll"), icon: "buch", count: count((r) => r.status !== "verworfen") },
    { id: "bewaehrt", name: tr("listProven"), icon: "siegel", count: count((r) => r.status === "bewaehrt") },
    {
      id: "ausprobieren",
      name: tr("listToTry"),
      icon: "kolben",
      count: count((r) => r.status === "ausprobieren"),
    },
    { id: "zuletzt", name: tr("listRecent"), icon: "verlauf", count: count((r) => !!r.lastMade) },
  ];
  const discarded = count((r) => r.status === "verworfen");

  const newest = (a: RecipeView, b: RecipeView) =>
    (b.created ?? "").localeCompare(a.created ?? "") || b.modified - a.modified;
  const inList = useMemo(() => {
    let l = originals.filter((r) => r.status !== "verworfen");
    if (list === "bewaehrt")
      l = visible
        .filter((r) => r.status === "bewaehrt")
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title, "de"));
    else if (list === "ausprobieren") l = originals.filter((r) => r.status === "ausprobieren").sort(newest);
    else if (list === "zuletzt")
      l = originals.filter((r) => !!r.lastMade).sort((a, b) => (b.lastMade ?? "").localeCompare(a.lastMade ?? ""));
    else if (list === "verworfen") l = originals.filter((r) => r.status === "verworfen").sort(newest);
    else if (list.startsWith("kat:")) l = l.filter((r) => r.category === list.slice(4)).sort(newest);
    else l = l.sort(newest);
    return l;
  }, [originals, list]);

  const hits: Hit[] = useMemo(() => (search.trim() ? searchIndex.current.search(search) : []), [search, visible]);
  const listName = list.startsWith("kat:")
    ? list.slice(4)
    : list === "verworfen"
      ? tr("listDiscarded")
      : (lists.find((l) => l.id === list)?.name ?? tr("appName"));

  const retry = async (id: string) => {
    const r = await p.onRetry(id);
    if (!r.ok) p.onHint(r.message ?? tr("failed"));
  };
  const running = p.jobs.filter((a) => !a.error).length;

  const startTimer = (title: string, recipe: string, sec: number) => {
    setTimers((u) => [...u, { id: Date.now() + Math.random(), title, recipe, end: Date.now() + sec * 1000 }]);
    setNow(Date.now());
  };

  const faktorVon = (r: RecipeView) => {
    const base = r.servings?.count;
    const value = servings[r.path];
    if (!base) return value ?? 1; // no yield given: use the factor directly
    return (value ?? base) / base;
  };

  return (
    <div class="rz-app" ref={rootRef}>
      <Sidebar
        lists={lists}
        categories={categories}
        discarded={discarded}
        active={search.trim() ? null : list}
        onList={choose}
        search={search}
        onSearch={(s) => {
          setSearch(s);
          setOpenPath(null);
        }}
        searchRef={searchRef}
        onImport={() => setImportOpen(true)}
        mode={p.mode}
        onMode={p.palette === "obsidian" ? undefined : p.onMode}
        jobs={p.jobs}
      />
      <main class="rz-haupt" aria-labelledby="rz-titel">
        <Overview
          title={search.trim() ? tr("search") : listName}
          list={list}
          lists={lists}
          categories={categories}
          discarded={discarded}
          recipes={search.trim() ? hits.map((t) => byPath.get(t.path)).filter((x): x is RecipeView => !!x) : inList}
          hits={search.trim() ? hits : null}
          search={search}
          onSearch={(s) => setSearch(s)}
          searchRef={searchRef}
          onList={choose}
          onRecipe={setOpenPath}
          onImport={() => setImportOpen(true)}
          jobs={list === "alle" || list === "ausprobieren" ? p.jobs : []}
          running={running}
          onJobGone={p.onJobGone}
          onRetry={retry}
          onView={() => setViewOpen(true)}
          total={visible.length}
          folder={p.folder}
        />
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
            onAttempt={() => setAttemptFor(openRecipe.path)}
            onShop={(factor, skip) => p.onShop(openRecipe.path, factor, skip)}
            onOpenNote={() => p.onOpenNote(openRecipe.path)}
            onShare={() => setDialog("share")}
            onPlan={() => setDialog("plan")}
            onTranslate={p.canTranslate && p.onTranslate ? () => setDialog("translate") : undefined}
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
        />
      )}

      {timers.length > 0 && (
        <TimerBar
          timers={timers}
          now={now}
          onPause={(id) =>
            setTimers((u) =>
              u.map((x) =>
                x.id !== id
                  ? x
                  : x.rest !== undefined
                    ? { ...x, end: Date.now() + x.rest, rest: undefined }
                    : { ...x, rest: Math.max(0, x.end - Date.now()) },
              ),
            )
          }
          onDismiss={(id) => setTimers((u) => u.filter((x) => x.id !== id))}
        />
      )}

      {importOpen && (
        <ImportModal
          recipes={visible}
          jobs={p.jobs}
          processor={p.processor}
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
          onCloseView={() => setViewOpen(false)}
        />
      )}

      {dialog && openRecipe && (
        <RecipeDialogs
          dialog={dialog}
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
