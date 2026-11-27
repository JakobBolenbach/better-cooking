// Overview: header with list chips and search, grid of recipe cards, empty state.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef } from "preact/hooks";
import { fieldName, type Hit } from "../search";
import type { Job, RecipeView } from "../types";
import { JobCard, syncProp } from "./jobs";
import { FailureCard } from "./failureCard";
import { OrphanCard, type ImproveHost } from "./improveBanner";
import type { JobActions } from "./jobActions";
import { Image, type List, StatusBadge, Stars, timeShort, importStateLabel } from "./shared";
import { Icon } from "./icons";
import type { ListEntry } from "./lists";
import { SearchField } from "./sidebar";
import { tr } from "../i18n";

// ---------------------------------------------------------------- Overview

export function Overview(p: {
  title: string;
  list: List;
  lists: ListEntry[];
  categories: [string, number][];
  discarded: number;
  recipes: RecipeView[];
  hits: Hit[] | null;
  search: string;
  onSearch: (s: string) => void;
  searchRef: { current: HTMLInputElement | null };
  onList: (l: List) => void;
  onRecipe: (path: string) => void;
  onImport: () => void;
  jobs: Job[];
  running: number;
  actions: JobActions;
  failures?: RecipeView[];
  /** Improvement proposals without a recipe (ADR 0007). */
  orphans?: ImproveHost["orphans"];
  onOrphan?: ImproveHost["onOrphan"];
  onOpenNote?: (path: string) => void;
  onView: () => void;
  total: number;
  folder?: string;
  folderMissing?: boolean;
}) {
  const hitsBy = useMemo(() => new Map((p.hits ?? []).map((t) => [t.path, t])), [p.hits]);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Keep the selected list visible, also when it was chosen via "Listen und Ansicht" and lies off to the right.
  useEffect(() => {
    chipsRef.current
      ?.querySelector<HTMLElement>(".rz-chip.an")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [p.list]);
  const extras = p.jobs.length + (p.failures?.length ?? 0) + (p.orphans?.length ?? 0);
  const approximate = p.hits?.[0]?.approximate;
  const chips: { id: List; name: string }[] = [
    ...p.lists.map((l) => ({ id: l.id, name: l.id === "alle" ? tr("listAllShort") : l.name })),
    ...p.categories.map(([k]) => ({ id: `kat:${k}` as List, name: k })),
    ...(p.discarded ? [{ id: "verworfen" as List, name: tr("listDiscarded") }] : []),
  ];
  return (
    <div class="rz-uebersicht">
      <header class="rz-ue-kopf">
        <div class="rz-ue-titelzeile">
          <h1 id="rz-titel" class="rz-ue-titel">
            {p.title}
          </h1>
          <span class="rz-titel-knoepfe rz-nur-schmal">
            <button type="button" class="rz-rund rz-rund-leise" aria-label={tr("listsAndView")} onClick={p.onView}>
              <Icon n="regler" large={19} />
            </button>
            <button
              type="button"
              class="rz-rund"
              aria-label={p.running ? tr("fetchRecipeRunning", { n: p.running }) : tr("fetchRecipe")}
              onClick={p.onImport}
            >
              <Icon n="plus" large={20} />
              {p.running > 0 && <span class="rz-rund-zahl">{p.running}</span>}
            </button>
          </span>
        </div>
        <div class="rz-nur-schmal">
          <SearchField value={p.search} onValue={p.onSearch} fieldRef={p.searchRef} large />
        </div>
        {!p.hits && (
          <div class="rz-chips rz-nur-schmal" role="tablist" aria-label={tr("lists")} ref={chipsRef}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={p.list === c.id}
                class={`rz-chip${p.list === c.id ? " an" : ""}`}
                onClick={() => p.onList(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {p.hits && (
          <p class="rz-ue-info">
            {p.hits.length
              ? p.hits.length === 1
                ? tr("hitsOne", { q: p.search.trim() })
                : tr("hitsMany", { n: p.hits.length, q: p.search.trim() })
              : tr("noHits", { q: p.search.trim() })}
            {approximate && tr("approximateHits")}
          </p>
        )}
      </header>

      {p.folderMissing && p.folder !== undefined && (
        <p class="rz-ordner-hinweis" role="status">
          {tr("folderMissingHint", { folder: p.folder })}
        </p>
      )}
      {p.total === 0 && !extras ? (
        <EmptyState folder={p.folder} onImport={p.onImport} />
      ) : (
        <>
          {p.jobs.length > 0 && (
            <section>
              <h2 class="rz-raster-titel">{tr("importsHeading")}</h2>
              <ul class="rz-raster" aria-label={tr("importsHeading")}>
                {p.jobs.map((a) => (
                  <li key={a.id}>
                    <JobCard a={a} actions={p.actions} sync={syncProp(p.jobs, a, p.actions.onSyncNow)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!p.failures?.length && (
            <section>
              <h2 class="rz-raster-titel">{tr("failedImports")}</h2>
              <ul class="rz-raster" aria-label={tr("failedImports")}>
                {p.failures.map((r) => (
                  <li key={r.path}>
                    <FailureCard
                      r={r}
                      onOpen={() => p.onOpenNote?.(r.path)}
                      onRemove={() => p.actions.onRemoveFailure?.(r.path, r.job ?? "")}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!p.orphans?.length && (
            <section>
              <h2 class="rz-raster-titel">{tr("improveOrphansHeading")}</h2>
              <ul class="rz-raster" aria-label={tr("improveOrphansHeading")}>
                {p.orphans.map((o) => (
                  <li key={o.path}>
                    <OrphanCard o={o} onAct={(what) => p.onOrphan?.(o.path, what)} onOpen={p.onOpenNote} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(p.recipes.length > 0 || extras === 0) && (
            <section>
              {extras > 0 && <h2 class="rz-raster-titel">{tr("recipesHeading")}</h2>}
              <ul class="rz-raster" aria-label={extras > 0 ? tr("recipesHeading") : p.title}>
                {p.recipes.map((r) => (
                  <li key={r.path}>
                    <Card r={r} hits={hitsBy.get(r.path)} onClick={() => p.onRecipe(r.path)} />
                  </li>
                ))}
                {!p.recipes.length && !extras && !p.hits && <li class="rz-raster-leer">{tr("emptyList")}</li>}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Nothing in the recipe folder yet: invitation to the first import. */
function EmptyState({ folder, onImport }: { folder?: string; onImport: () => void }) {
  return (
    <div class="rz-leer">
      <span class="rz-leer-icon">
        <Icon n="muetze" large={32} />
      </span>
      <p class="rz-leer-titel">{tr("emptyTitle")}</p>
      <p>{tr("emptyText")}</p>
      {folder !== undefined && <p class="rz-leer-ordner">{tr("emptyFolder", { folder: folder || "/" })}</p>}
      <button type="button" class="rz-knopf rz-knopf-haupt" onClick={onImport}>
        <Icon n="plus" />
        {tr("fetchRecipe")}
      </button>
    </div>
  );
}

export function Card({ r, hits, onClick }: { r: RecipeView; hits?: Hit; onClick: () => void }) {
  const time = timeShort(r.timeTotal);
  const reason =
    hits &&
    hits.fields
      .filter((f) => f !== "title")
      .slice(0, 2)
      .map((f) => fieldName(f))
      .join(", ");
  return (
    <button type="button" class="rz-karte" onClick={onClick}>
      <span class="rz-karte-bild">
        <Image src={r.imageSrc} alt="" />
        {r.status !== "ausprobieren" && <StatusBadge s={r.status} />}
        {r.improving && (
          <span class="rz-marke rz-marke-import rz-marke-verbessert">
            <Icon n="lader" large={13} className="rz-dreht" />
            {tr("improvingBadge")}
          </span>
        )}
        {!r.improving && r.importState && r.importState !== "fertig" && (
          <span class="rz-marke rz-marke-import">
            <Icon n="warnung" large={13} />
            {tr("importState", { state: importStateLabel(r.importState) })}
          </span>
        )}
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{r.title}</span>
        <span class="rz-karte-meta">
          {time && (
            <span>
              <Icon n="uhr" large={13} />
              {time}
            </span>
          )}
          {r.category && <span>{r.category}</span>}
          {r.status === "ausprobieren" && <span class="rz-meta-test">{tr("toTest")}</span>}
          <Stars value={r.rating} />
        </span>
        {reason && <span class="rz-karte-grund">{tr("hitIn", { fields: reason })}</span>}
      </span>
    </button>
  );
}
