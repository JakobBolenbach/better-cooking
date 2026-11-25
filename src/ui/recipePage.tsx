// Rezeptseite: Kopf mit Bild und Eckdaten, Portionen, Zutaten, Schritte, Tipps, Versuche.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import { useState } from "preact/hooks";
import { nextServing } from "../quantities";
import { todayIso, isoToGerman } from "../parse";
import type { RecipeView, Status, Theme } from "../types";
import { Timeline, Image, Inline, STATUS_LABEL, Stars, useSwipeBack, timeShort } from "./shared";
import { Icon } from "./icons";
import { WithTimers, StepTitle, IngredientList } from "./ingredients";

// ---------------------------------------------------------------- Rezeptseite

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
  onOpenNote: () => void;
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
          <span>Rezepte</span>
        </button>
        <span class="rz-leiste-titel" aria-hidden="true">
          {r.title}
        </span>
        <div class="rz-leiste-aktionen">
          <button type="button" class="rz-symbol" aria-label="In Obsidian öffnen" onClick={p.onOpenNote}>
            <Icon n="notiz" />
          </button>
          {r.steps.length > 0 && (
            <button type="button" class="rz-knopf rz-knopf-haupt rz-knopf-klein" onClick={p.onCook}>
              <Icon n="flamme" large={16} />
              Kochen
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
                  <b>{timeShort(r.timeTotal)}</b> gesamt
                </span>
              </li>
            )}
            {r.timeActive && (
              <li>
                <Icon n="besteck" />
                <span>
                  <b>{timeShort(r.timeActive)}</b> Arbeit
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
                  {host ?? "Quelle"}
                </a>
              )}
            </p>
          )}
          {r.importState && r.importState !== "fertig" && (
            <p class="rz-hinweis rz-hinweis-warn">
              <Icon n="warnung" large={16} />
              Import {r.importState}
              {r.importError ? `: ${r.importError}` : ""}
            </p>
          )}
        </div>
      </header>

      <section class="rz-pflege" aria-label="Stand und Bewertung">
        <div class="rz-segment" role="radiogroup" aria-label="Stand">
          {(["ausprobieren", "bewaehrt", "verworfen"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={r.status === s}
              class={r.status === s ? `an an-${s}` : ""}
              onClick={() => p.onStatus(s)}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Stars value={r.rating} onValue={p.onRating} />
        <div class="rz-pflege-knoepfe">
          <button type="button" class="rz-knopf" disabled={r.lastMade === today} onClick={p.onMade}>
            <Icon n="gemacht" large={16} />
            {r.lastMade === today
              ? "Heute gemacht"
              : r.lastMade
                ? `Zuletzt ${isoToGerman(r.lastMade)} · heute`
                : "Heute gemacht"}
          </button>
          <button type="button" class="rz-knopf" onClick={p.onAttempt}>
            <Icon n="stift" large={16} />
            Versuch notieren
          </button>
        </div>
      </section>

      <div class="rz-koerper">
        <aside class="rz-spalte-zutaten" aria-labelledby="rz-zutaten-titel">
          <div class="rz-zutaten-karte">
            <div class="rz-zutaten-kopf">
              <h2 id="rz-zutaten-titel" class="rz-h2">
                Zutaten
              </h2>
              <ServingsControl r={r} faktor={p.faktor} serving={p.serving} onServing={p.onServing} />
            </div>
            <IngredientList r={r} faktor={p.faktor} checked={p.checked} onCheck={p.onCheck} />
            {p.faktor !== 1 && (
              <p class="rz-fussnote">
                Mengen in den Schritten gelten für{" "}
                {r.servings ? `${fmt(r.servings.count)} ${r.servings.unit}` : "die Originalmenge"}.
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
                  Zeitplan
                </h2>
                <Icon n={timelineClosed ? "rechts" : "links"} className={timelineClosed ? "" : "rz-dreh-unten"} />
              </button>
              {!timelineClosed && <Timeline svg={r.timelineSvg} />}
            </section>
          )}

          <section class="rz-abschnitt" aria-labelledby="rz-schritte-titel">
            <h2 id="rz-schritte-titel" class="rz-h2">
              Zubereitung
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
                        <WithTimers text={s.text} title={s.title ?? `Schritt ${i + 1}`} onTimer={p.onTimer} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="rz-hinweis">
                Keine Schritte erkannt.{" "}
                <button type="button" class="rz-link" onClick={p.onOpenNote}>
                  In Obsidian ansehen
                </button>
              </p>
            )}
          </section>

          {r.tips.length > 0 && (
            <section class="rz-abschnitt rz-tipps" aria-labelledby="rz-tipps-titel">
              <h2 id="rz-tipps-titel" class="rz-h2">
                Tipps
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
                Versuche
              </h2>
              <button type="button" class="rz-link" onClick={p.onAttempt}>
                <Icon n="plus" large={14} />
                Notieren
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
              <p class="rz-leise">
                Noch nicht gemacht. Nach dem Kochen hier festhalten, was du geändert hast und wie es war.
              </p>
            )}
          </section>

          {r.imageSrcs.length > 0 && (
            <section class="rz-abschnitt" aria-labelledby="rz-bilder-titel">
              <h2 id="rz-bilder-titel" class="rz-h2">
                Bilder
              </h2>
              <div class="rz-galerie">
                {r.imageSrcs.map((b, i) => (
                  <Image key={i} src={b} alt={`${r.title}, Bild ${i + 1}`} />
                ))}
              </div>
            </section>
          )}

          {r.notes.length > 0 && (
            <section class="rz-abschnitt" aria-labelledby="rz-notizen-titel">
              <h2 id="rz-notizen-titel" class="rz-h2">
                Notizen
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
      <div class="rz-segment rz-segment-klein" role="radiogroup" aria-label="Menge">
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
    <div class="rz-regler" role="group" aria-label="Portionen">
      <button type="button" aria-label="Weniger" onClick={() => onServing(nextServing(current, -1, base))}>
        <Icon n="minus" large={16} />
      </button>
      <span class="rz-regler-wert" aria-live="polite">
        <b>{fmt(current)}</b> {r.servings!.unit}
      </span>
      <button type="button" aria-label="Mehr" onClick={() => onServing(nextServing(current, 1, base))}>
        <Icon n="plus" large={16} />
      </button>
      {current !== base && (
        <button type="button" class="rz-regler-zurueck" aria-label="Originalmenge" onClick={() => onServing(base)}>
          <Icon n="zurueck" large={14} />
        </button>
      )}
    </div>
  );
}
