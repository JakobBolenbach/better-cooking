// Recipe page: header with image and key facts, servings, ingredients, steps, tips, attempts.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useState } from "preact/hooks";
import { nextServing } from "../quantities";
import { todayIso } from "../parse";
import type { RecipeView, Status, Theme } from "../types";
import { Timeline, Image, Inline, statusLabel, Stars, useSwipeBack, timeShort, importStateLabel } from "./shared";
import { Icon } from "./icons";
import { WithTimers, StepTitle, IngredientList } from "./ingredients";
import { formatDate, tr } from "../i18n";
import { findingsText } from "../importCheck";

// ---------------------------------------------------------------- Recipe page

export function RecipePage(p: {
  r: RecipeView;
  theme: Theme;
  faktor: number;
  serving?: number;
  onServing: (n: number) => void;
  checked: string[];
  onCheck: (k: string) => void;
  onBack: () => void;
  onCook: () => void;
  onTimer: (title: string, sec: number) => void;
  onStatus: (s: Status) => void;
  onRating: (n: number | null) => void;
  onMade: () => void;
  onAttempt: () => void;
  onShop: (factor: number, skip: string[]) => void;
  onOpenNote: () => void;
  onShare: () => void;
  onPlan: () => void;
}) {
  const { r } = p;
  const [scrolled, setScrolled] = useState(false);
  const [timelineClosed, setTimelineClosed] = useState(false);
  const swipe = useSwipeBack(p.onBack);
  const host = r.source
    ? (() => {
        try {
          return new URL(r.source).hostname.replace(/^www\./, "");
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const today = todayIso();
  return (
    <article
      class="rz-detail"
      aria-labelledby="rz-rezept-titel"
      ref={swipe.ref}
      onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 160)}
    >
      <div class={`rz-detail-leiste${scrolled ? " gescrollt" : ""}`}>
        <button type="button" class="rz-zurueck" onClick={p.onBack}>
          <Icon n="links" large={20} />
          <span>{tr("appName")}</span>
        </button>
        <span class="rz-leiste-titel" aria-hidden="true">
          {r.title}
        </span>
        <div class="rz-leiste-aktionen">
          <button type="button" class="rz-symbol" aria-label={tr("share")} onClick={p.onShare}>
            <Icon n="teilen" />
          </button>
          <button type="button" class="rz-symbol" aria-label={tr("openInObsidian")} onClick={p.onOpenNote}>
            <Icon n="notiz" />
          </button>
          {r.steps.length > 0 && (
            <button type="button" class="rz-knopf rz-knopf-haupt rz-knopf-klein" onClick={p.onCook}>
              <Icon n="flamme" large={16} />
              {tr("cook")}
            </button>
          )}
        </div>
      </div>

      <header class="rz-held">
        <div class="rz-held-bild">
          <Image src={r.imageSrc} alt={r.title} />
        </div>
        <div class="rz-held-text">
          {r.category && <span class="rz-oberzeile">{r.category}</span>}
          <h1 id="rz-rezept-titel" class="rz-rezept-titel">
            {r.title}
          </h1>
          {r.description && (
            <p class="rz-beschreibung">
              <Inline text={r.description} />
            </p>
          )}
          <ul class="rz-fakten">
            {r.timeTotal && (
              <li>
                <Icon n="uhr" />
                <span>
                  <b>{timeShort(r.timeTotal)}</b> {tr("total")}
                </span>
              </li>
            )}
            {r.timeActive && (
              <li>
                <Icon n="besteck" />
                <span>
                  <b>{timeShort(r.timeActive)}</b> {tr("active")}
                </span>
              </li>
            )}
            {r.result && (
              <li>
                <Icon n="personen" />
                <span>
                  <b>{r.result}</b>
                </span>
              </li>
            )}
          </ul>
          {(r.author || r.source) && (
            <p class="rz-quelle">
              {r.author && <span>{r.author}</span>}
              {r.source && (
                <a href={r.source} target="_blank" rel="noopener">
                  <Icon n="extern" large={14} />
                  {host ?? tr("source")}
                </a>
              )}
            </p>
          )}
          {r.importState && r.importState !== "fertig" && (
            <p class="rz-hinweis rz-hinweis-warn">
              <Icon n="warnung" large={16} />
              {tr("importState", { state: importStateLabel(r.importState) })}
              {r.importError ? `: ${r.importError}` : ""}
            </p>
          )}
          {r.findings && (
            <p class="rz-hinweis rz-hinweis-warn">
              <Icon n="warnung" large={16} />
              {tr("findingsHint", { what: findingsText(r.findings) })}
            </p>
          )}
        </div>
      </header>

      <section class="rz-pflege" aria-label={tr("stateAndRating")}>
        <div class="rz-segment" role="radiogroup" aria-label={tr("state")}>
          {(["ausprobieren", "bewaehrt", "verworfen"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={r.status === s}
              class={r.status === s ? `an an-${s}` : ""}
              onClick={() => p.onStatus(s)}
            >
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <Stars value={r.rating} onValue={p.onRating} />
        <div class="rz-pflege-knoepfe">
          <button type="button" class="rz-knopf" disabled={r.lastMade === today} onClick={p.onMade}>
            <Icon n="gemacht" large={16} />
            {r.lastMade === today
              ? tr("madeToday")
              : r.lastMade
                ? tr("lastMadeToday", { date: formatDate(r.lastMade) })
                : tr("madeToday")}
          </button>
          <button type="button" class="rz-knopf" onClick={p.onAttempt}>
            <Icon n="stift" large={16} />
            {tr("noteAttempt")}
          </button>
          <button type="button" class="rz-knopf" onClick={p.onPlan}>
            <Icon n="kalender" large={16} />
            {tr("plan")}
          </button>
        </div>
      </section>

      <div class="rz-koerper">
        <aside class="rz-spalte-zutaten" aria-labelledby="rz-zutaten-titel">
          <div class="rz-zutaten-karte">
            <div class="rz-zutaten-kopf">
              <h2 id="rz-zutaten-titel" class="rz-h2">
                {tr("ingredients")}
              </h2>
              <ServingsControl r={r} faktor={p.faktor} serving={p.serving} onServing={p.onServing} />
            </div>
            <IngredientList r={r} faktor={p.faktor} checked={p.checked} onCheck={p.onCheck} />
            {r.ingredients.length > 0 && (
              <button
                type="button"
                class="rz-link rz-einkauf"
                title={p.checked.length ? tr("toShoppingListHint") : undefined}
                onClick={() => p.onShop(p.faktor, p.checked)}
              >
                <Icon n="wagen" large={14} />
                {p.checked.length ? tr("toShoppingListRest") : tr("toShoppingList")}
              </button>
            )}
            {p.faktor !== 1 && (
              <p class="rz-fussnote">
                {tr("quantitiesInStepsFor")}{" "}
                {r.servings
                  ? `${fmt(r.servings.count)} ${r.servings.unit || tr("servingsUnit")}`
                  : tr("originalQuantity")}
                .
              </p>
            )}
          </div>
        </aside>

        <div class="rz-spalte-haupt">
          {r.timelineSvg && (
            <section class="rz-abschnitt" aria-labelledby="rz-ablauf-titel">
              <button
                type="button"
                class="rz-abschnitt-kopf"
                aria-expanded={!timelineClosed}
                onClick={() => setTimelineClosed(!timelineClosed)}
              >
                <h2 id="rz-ablauf-titel" class="rz-h2">
                  {tr("schedule")}
                </h2>
                <Icon n={timelineClosed ? "rechts" : "links"} className={timelineClosed ? "" : "rz-dreh-unten"} />
              </button>
              {!timelineClosed && <Timeline svg={r.timelineSvg} />}
            </section>
          )}

          <section class="rz-abschnitt" aria-labelledby="rz-schritte-titel">
            <h2 id="rz-schritte-titel" class="rz-h2">
              {tr("preparation")}
            </h2>
            {r.steps.length ? (
              <ol class="rz-schritte">
                {r.steps.map((s, i) => (
                  <li key={i} class="rz-schritt">
                    <span class="rz-schritt-nr" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div class="rz-schritt-text">
                      {s.title && (
                        <p class="rz-schritt-titel">
                          <StepTitle title={s.title} onTimer={p.onTimer} />
                        </p>
                      )}
                      <p>
                        <WithTimers text={s.text} title={s.title ?? tr("stepN", { n: i + 1 })} onTimer={p.onTimer} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="rz-hinweis">
                {tr("noSteps")}{" "}
                <button type="button" class="rz-link" onClick={p.onOpenNote}>
                  {tr("viewInObsidian")}
                </button>
              </p>
            )}
          </section>

          {r.tips.length > 0 && (
            <section class="rz-abschnitt rz-tipps" aria-labelledby="rz-tipps-titel">
              <h2 id="rz-tipps-titel" class="rz-h2">
                {tr("tips")}
              </h2>
              <ul>
                {r.tips.map((t, i) => (
                  <li key={i}>
                    <Inline text={t} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section class="rz-abschnitt" aria-labelledby="rz-versuche-titel">
            <div class="rz-abschnitt-zeile">
              <h2 id="rz-versuche-titel" class="rz-h2">
                {tr("attempts")}
              </h2>
              <button type="button" class="rz-link" onClick={p.onAttempt}>
                <Icon n="plus" large={14} />
                {tr("note")}
              </button>
            </div>
            {r.attempts.length ? (
              <ol class="rz-versuche">
                {r.attempts.map((v, i) => (
                  <li key={i}>
                    <span class="rz-versuch-datum">{v.date}</span>
                    <ul>
                      {v.lines.map((z, j) => (
                        <li key={j}>
                          <Inline text={z} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="rz-leise">{tr("noAttempts")}</p>
            )}
          </section>

          {r.imageSrcs.length > 0 && (
            <section class="rz-abschnitt" aria-labelledby="rz-bilder-titel">
              <h2 id="rz-bilder-titel" class="rz-h2">
                {tr("images")}
              </h2>
              <div class="rz-galerie">
                {r.imageSrcs.map((b, i) => (
                  <Image key={i} src={b} alt={tr("imageN", { title: r.title, n: i + 1 })} />
                ))}
              </div>
            </section>
          )}

          {r.notes.length > 0 && (
            <section class="rz-abschnitt" aria-labelledby="rz-notizen-titel">
              <h2 id="rz-notizen-titel" class="rz-h2">
                {tr("notes")}
              </h2>
              <ul class="rz-notizen">
                {r.notes.map((n, i) => (
                  <li key={i}>
                    <Inline text={n} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

export const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function ServingsControl({
  r,
  faktor,
  serving,
  onServing,
}: {
  r: RecipeView;
  faktor: number;
  serving?: number;
  onServing: (n: number) => void;
}) {
  const base = r.servings?.count;
  if (!base) {
    const levels = [0.5, 1, 2, 3];
    return (
      <div class="rz-segment rz-segment-klein" role="radiogroup" aria-label={tr("quantity")}>
        {levels.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={faktor === f}
            class={faktor === f ? "an" : ""}
            onClick={() => onServing(f)}
          >
            {f === 0.5 ? "½×" : `${f}×`}
          </button>
        ))}
      </div>
    );
  }
  const current = serving ?? base;
  return (
    <div class="rz-regler" role="group" aria-label={tr("servings")}>
      <button type="button" aria-label={tr("less")} onClick={() => onServing(nextServing(current, -1, base))}>
        <Icon n="minus" large={16} />
      </button>
      <span class="rz-regler-wert" aria-live="polite">
        <b>{fmt(current)}</b> {r.servings!.unit || tr("servingsUnit")}
      </span>
      <button type="button" aria-label={tr("more")} onClick={() => onServing(nextServing(current, 1, base))}>
        <Icon n="plus" large={16} />
      </button>
      {current !== base && (
        <button type="button" class="rz-regler-zurueck" aria-label={tr("original")} onClick={() => onServing(base)}>
          <Icon n="zurueck" large={14} />
        </button>
      )}
    </div>
  );
}
