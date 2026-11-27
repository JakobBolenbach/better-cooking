// Recipe page: header with image and key facts, servings, ingredients, steps, tips, attempts.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useRef, useState } from "preact/hooks";
import { servingsUnitText } from "../servingsWords";
import { nextServing, formatQuantity, servingsText } from "../quantities";
import type { RecipeView, Status, Theme } from "../types";
import { Timeline, Image, Inline, statusLabel, Stars } from "./shared";
import { Icon } from "./icons";
import { RecipeToolbar } from "./recipeToolbar";
import { RecipeHero } from "./recipeHero";
import { WithTimers, StepTitle, IngredientList } from "./ingredients";
import { MadeButton } from "./madeButton";
import { tr } from "../i18n";

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
  onUndoMade: () => void;
  onAttempt: () => void;
  onShop: (factor: number, skip: string[]) => void;
  onOpenNote: () => void;
  onShare: () => void;
  onPlan: () => void;
  /** Only when the own AI is set up. */
  onTranslate?: () => void;
  /** Fetch the source again (issue #63); unset when this recipe has no source or the page is a translation. */
  refetch?: { onClick: () => void };
  /** A proposal for an improved version waits for a look (ADR 0007): the banner opens the review dialog. */
  improve?: { onClick?: () => void };
  /** The original and its translations, when there are any (issue #10). */
  languages?: { path: string; label: string }[];
  onOpen: (path: string) => void;
  /** Delete the recipe (issue #119); unset where the host cannot. */
  onDelete?: () => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}) {
  const { r } = p;
  const [scrolled, setScrolled] = useState(false);
  const [timelineClosed, setTimelineClosed] = useState(false);
  return (
    <article
      class="rz-detail"
      aria-labelledby="rz-rezept-titel"
      onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 160)}
    >
      <RecipeToolbar
        r={r}
        scrolled={scrolled}
        onBack={p.onBack}
        onTranslate={p.onTranslate}
        refetch={p.refetch}
        onShare={p.onShare}
        onOpenNote={p.onOpenNote}
        onCook={p.onCook}
        onDelete={p.onDelete}
        menuOpen={p.menuOpen}
        onMenu={p.onMenu}
      />

      <RecipeHero r={r} faktor={p.faktor} languages={p.languages} onOpen={p.onOpen} improve={p.improve} />

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
          <MadeButton key={r.path} lastMade={r.lastMade} onMade={p.onMade} onUndo={p.onUndoMade} />
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
                {tr("quantitiesInStepsFor")} {r.servings ? servingsText(r.servings) : tr("originalQuantity")}.
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
  const plusRef = useRef<HTMLButtonElement>(null);
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
  const atBase = current === base;
  return (
    <div class="rz-regler" role="group" aria-label={tr("servings")}>
      <button type="button" aria-label={tr("less")} onClick={() => onServing(nextServing(current, -1, base))}>
        <Icon n="minus" large={16} />
      </button>
      <span class="rz-regler-wert" aria-live="polite">
        <b>{formatQuantity(current)}</b> {servingsUnitText(r.servings!.unit, current)}
      </span>
      <button
        ref={plusRef}
        type="button"
        aria-label={tr("more")}
        onClick={() => onServing(nextServing(current, 1, base))}
      >
        <Icon n="plus" large={16} />
      </button>
      {/* Always rendered so that "-" and "+" never move; hidden while at the original amount. */}
      <button
        type="button"
        class="rz-regler-zurueck"
        aria-label={tr("original")}
        disabled={atBase}
        onClick={() => {
          // The button disables itself: keep the focus in the control instead of dropping it to the page.
          plusRef.current?.focus();
          onServing(base);
        }}
      >
        <Icon n="zurueck" large={14} />
      </button>
    </div>
  );
}
