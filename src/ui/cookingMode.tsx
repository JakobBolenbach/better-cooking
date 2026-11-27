// Full-screen cooking mode: one step per view (the timer bar is src/ui/timerBar.tsx).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ingredientsInStep } from "../cooking";
import type { RecipeView } from "../types";
import { Icon } from "./icons";
import { WithTimers, StepTitle, IngredientList } from "./ingredients";
import { servingsText } from "../quantities";
import { nextStep } from "../tapZones";
import { useTapZones } from "./useTapZones";
import { TapZoneOverlay } from "./tapZoneOverlay";
import { tr } from "../i18n";

// ---------------------------------------------------------------- Cooking mode

export function CookingMode(p: {
  r: RecipeView;
  step: number;
  faktor: number;
  onStep: (n: number) => void;
  onCloseView: () => void;
  onTimer: (title: string, sec: number) => void;
  onAttempt: () => void;
  onKeepAwake: (an: boolean) => Promise<boolean>;
  /** The hint on the tap zones was shown before (saved in the settings). */
  tapHintSeen?: boolean;
  onTapHintSeen?: () => void;
  /** Cooking mode continued at a remembered step: says so until the step changes and offers the first step. */
  resumed?: boolean;
  /** Passed on to the tap zone hint (tests); default: asks the browser. */
  touch?: boolean;
}) {
  const { r } = p;
  const n = r.steps.length;
  const done = p.step >= n;
  const s = r.steps[Math.min(p.step, n - 1)];
  const [awake, setAwake] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const showResumed = !!p.resumed && !done && p.step > 0;
  // Once the hint was there its place stays (hidden), so the layout does not jump when it ends.
  const [hintSpace, setHintSpace] = useState(false);
  useEffect(() => {
    if (showResumed) setHintSpace(true);
  }, [showResumed]);
  // A focused button that goes away ("Start over", "Next" in the done view) must not drop the focus to the page:
  // the keys (Esc, arrows) would no longer reach cooking mode. The focus moves to the dialog itself.
  useEffect(() => {
    const el = dialog.current;
    const active = el?.ownerDocument.activeElement;
    const lost = !active || active === el?.ownerDocument.body || !!el?.querySelector(".verborgen")?.contains(active);
    if (el && lost) el.focus({ preventScroll: true });
  }, [showResumed, done]);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  useEffect(() => {
    void p.onKeepAwake(true).then(setAwake);
    return () => void p.onKeepAwake(false);
  }, []);
  const inStep = useMemo(
    () => (s ? ingredientsInStep(`${s.title ?? ""} ${s.text}`, r.ingredients) : []),
    [s, r.ingredients],
  );
  const zones = useTapZones((d) => {
    const to = nextStep(d, p.step, n);
    if (to === p.step) return false;
    p.onStep(to);
    return true;
  });
  return (
    <div class="rz-koch" role="dialog" aria-modal="true" aria-labelledby="rz-koch-titel" ref={dialog} tabIndex={-1}>
      <div class="rz-koch-kopf">
        <button type="button" class="rz-symbol" aria-label={tr("exitCooking")} onClick={p.onCloseView}>
          <Icon n="x" large={22} />
        </button>
        <div class="rz-koch-kopftext">
          <span id="rz-koch-titel" class="rz-koch-rezept">
            {r.title}
          </span>
          <span class="rz-koch-stand">
            <span aria-live="polite" aria-atomic="true">
              {done ? tr("done") : tr("stepNOfM", { n: p.step + 1, m: n })}
            </span>
            {r.servings && (
              <span class="rz-koch-menge">
                {tr("cookingFor", {
                  amount: servingsText(r.servings, p.faktor),
                })}
              </span>
            )}
            {awake && (
              <span class="rz-koch-wach">
                <Icon n="auge" large={13} />
                {tr("screenStaysOn")}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          class={`rz-knopf rz-knopf-klein${ingredientsOpen ? " an" : ""}`}
          aria-expanded={ingredientsOpen}
          onClick={() => setIngredientsOpen(!ingredientsOpen)}
        >
          {tr("ingredients")}
        </button>
      </div>
      <div class="rz-koch-fortschritt" aria-hidden="true">
        {r.steps.map((_, i) => (
          <span key={i} class={i < p.step ? "erledigt" : i === p.step ? "jetzt" : ""} />
        ))}
      </div>

      {(showResumed || hintSpace) && (
        <div class={`rz-koch-weiter${showResumed ? "" : " verborgen"}`} role="status">
          <span>{tr("cookResumed", { n: p.step + 1 })}</span>
          <button type="button" class="rz-link" onClick={() => p.onStep(0)}>
            {tr("cookFromStart")}
          </button>
        </div>
      )}

      <div class="rz-koch-buehne" ref={zones.area} {...zones.handlers}>
        {ingredientsOpen && (
          <div class="rz-koch-alle-zutaten">
            <IngredientList r={r} faktor={p.faktor} />
          </div>
        )}
        {done ? (
          <div class="rz-koch-fertig">
            <span class="rz-leer-icon">
              <Icon n="haken" large={36} />
            </span>
            <p class="rz-koch-schritttext">{tr("enjoy")}</p>
            <p class="rz-leise">{tr("howWasIt")}</p>
            <div class="rz-zeile">
              <button type="button" class="rz-knopf rz-knopf-haupt" onClick={p.onAttempt}>
                <Icon n="stift" large={16} />
                {tr("noteAttempt")}
              </button>
              <button type="button" class="rz-knopf" onClick={p.onCloseView}>
                {tr("close")}
              </button>
            </div>
          </div>
        ) : (
          <div class="rz-koch-schritt" key={p.step}>
            <span class="rz-koch-nr">{p.step + 1}</span>
            {s.title && (
              <p class="rz-koch-schritttitel">
                <StepTitle title={s.title} onTimer={p.onTimer} />
              </p>
            )}
            <p class="rz-koch-schritttext">
              <WithTimers text={s.text} title={s.title ?? tr("stepN", { n: p.step + 1 })} onTimer={p.onTimer} />
            </p>
            {inStep.length > 0 && (
              <div class="rz-koch-zutaten">
                <span class="rz-oberzeile">{tr("inThisStep")}</span>
                <IngredientList r={r} faktor={p.faktor} only={inStep} />
              </div>
            )}
          </div>
        )}
      </div>

      <TapZoneOverlay
        area={zones.area}
        pulse={zones.pulse}
        hintSeen={p.tapHintSeen}
        onHintSeen={p.onTapHintSeen}
        touch={p.touch}
      />
      <div class="rz-koch-fuss">
        <button
          type="button"
          class="rz-knopf rz-knopf-gross"
          disabled={p.step === 0}
          onClick={() => p.onStep(p.step - 1)}
        >
          <Icon n="links" large={20} />
          {tr("back")}
        </button>
        {!done && (
          <button type="button" class="rz-knopf rz-knopf-haupt rz-knopf-gross" onClick={() => p.onStep(p.step + 1)}>
            {p.step === n - 1 ? tr("done") : tr("next")}
            <Icon n="rechts" large={20} />
          </button>
        )}
      </div>
    </div>
  );
}
