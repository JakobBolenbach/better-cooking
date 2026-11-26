import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { RecipeSearch, type Hit } from "../search";
import type { Job, ColorMode, RecipeView, Status, Theme } from "../types";
import type { ActiveProcessor } from "../processor";
import { ImportModal } from "./jobs";
import type { List, TimerEngine } from "./shared";
import type { IconName } from "./icons";
import { ring, CookingMode, TimerBar } from "./cookingMode";
import { RecipePage } from "./recipePage";
import { ViewModal, Sidebar } from "./sidebar";
import { isInputField, keyForView } from "./keyboard";
import { Overview } from "./overview";
import { type AttemptInput, AttemptModal } from "./attempt";
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
  onOpenNote: (path: string) => void;
  onStatus: (path: string, s: Status) => void;
  onRating: (path: string, n: number | null) => void;
  onMade: (path: string) => void;
  onAttempt: (path: string, v: AttemptInput) => Promise<boolean>;
  onImport: (input: string) => Promise<{ ok: boolean; message?: string }>;
  onJobGone: (id: string) => void;
  /** Start the job again (same input) and remove the old one. */
  onRetry: (id: string) => Promise<{ ok: boolean; message?: string }>;
  onHint: (text: string) => void;
  onKeepAwake: (an: boolean) => Promise<boolean>;
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

  // Keyboard: "/" focuses the search, Esc closes the top layer.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!keyForView(target, rootRef.current)) return;
      const inField = isInputField(target);
      if (e.key === "Escape") {
        if (attemptFor) setAttemptFor(null);
        else if (viewOpen) setViewOpen(false);
        else if (importOpen) setImportOpen(false);
        else if (cooking) setCooking(null);
        else if (openPath) setOpenPath(null);
        else return;
        e.preventDefault();
      } else if (e.key === "/" && !inField && !cooking && !importOpen) {
        e.preventDefault();
        setOpenPath(null);
        // Wide layout has the search in the sidebar, narrow layout above the list: use the visible one.
        const fields = Array.from(rootRef.current?.querySelectorAll<HTMLInputElement>(".rz-suche input") ?? []).filter(
          (i) => i.offsetParent,
        );
        (fields[0] ?? searchRef.current)?.focus();
      } else if (cooking && !inField && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const r = byPath.get(cooking.path);
        if (!r) return;
        const n = r.steps.length;
        setCooking({ ...cooking, step: Math.max(0, Math.min(n, cooking.step + (e.key === "ArrowRight" ? 1 : -1))) });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const choose = (l: List) => {
    setList(l);
    setSearch("");
    setOpenPath(null);
    p.onList(l);
  };

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of visible)
      if (r.category && r.status !== "verworfen") m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [visible]);

  const count = (f: (r: RecipeView) => boolean) => visible.filter(f).length;
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
    let l = visible.filter((r) => r.status !== "verworfen");
    if (list === "bewaehrt")
      l = visible
        .filter((r) => r.status === "bewaehrt")
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title, "de"));
    else if (list === "ausprobieren") l = visible.filter((r) => r.status === "ausprobieren").sort(newest);
    else if (list === "zuletzt")
      l = visible.filter((r) => !!r.lastMade).sort((a, b) => (b.lastMade ?? "").localeCompare(a.lastMade ?? ""));
    else if (list === "verworfen") l = visible.filter((r) => r.status === "verworfen").sort(newest);
    else if (list.startsWith("kat:")) l = l.filter((r) => r.category === list.slice(4)).sort(newest);
    else l = l.sort(newest);
    return l;
  }, [visible, list]);

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
        onMode={p.onMode}
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
            onOpenNote={() => p.onOpenNote(openRecipe.path)}
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
          onMode={p.onMode}
          onImport={() => {
            setViewOpen(false);
            setImportOpen(true);
          }}
          running={running}
          onCloseView={() => setViewOpen(false)}
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
