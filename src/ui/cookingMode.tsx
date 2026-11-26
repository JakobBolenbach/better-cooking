// Full-screen cooking mode: one step per view, timer bar and signal tone.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useState } from "preact/hooks";
import { timer, ingredientsInStep } from "../cooking";
import type { RecipeView } from "../types";
import type { TimerEngine } from "./shared";
import { Icon } from "./icons";
import { WithTimers, StepTitle, IngredientList } from "./ingredients";
import { servingsText } from "../quantities";
import { nextStep } from "../tapZones";
import { useTapZones } from "./useTapZones";
import { useSwipeSteps } from "./useSwipeSteps";
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
}) {
  const { r } = p;
  const n = r.steps.length;
  const done = p.step >= n;
  const s = r.steps[Math.min(p.step, n - 1)];
  const [awake, setAwake] = useState(false);
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
  useSwipeSteps(zones.area, (d) => p.onStep(nextStep(d, p.step, n)));
  return (
    <div class="rz-koch" role="dialog" aria-modal="true" aria-labelledby="rz-koch-titel">
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

      <TapZoneOverlay area={zones.area} pulse={zones.pulse} hintSeen={p.tapHintSeen} onHintSeen={p.onTapHintSeen} />
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

// ---------------------------------------------------------------- Timers

export function TimerBar({
  timers,
  now,
  onPause,
  onDismiss,
}: {
  timers: TimerEngine[];
  now: number;
  onPause: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  return (
    <div class="rz-uhren" role="region" aria-label={tr("timers")}>
      {timers.map((u) => {
        const rest = u.done ? 0 : u.rest !== undefined ? u.rest : u.end - now;
        return (
          <div key={u.id} class={`rz-uhr${u.done ? " fertig" : ""}${u.rest !== undefined ? " pause" : ""}`}>
            <Icon n="timer" large={16} />
            <span class="rz-uhr-text">
              <span class="rz-uhr-zeit">{u.done ? tr("done") : timer(rest / 1000)}</span>
              <span class="rz-uhr-titel">{u.title}</span>
            </span>
            {!u.done && (
              <button
                type="button"
                class="rz-symbol"
                aria-label={u.rest !== undefined ? tr("resume") : tr("pause")}
                onClick={() => onPause(u.id)}
              >
                <Icon n={u.rest !== undefined ? "play" : "pause"} large={16} />
              </button>
            )}
            <button type="button" class="rz-symbol" aria-label={tr("removeTimer")} onClick={() => onDismiss(u.id)}>
              <Icon n="x" large={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Short tone when a timer ends (WebAudio, no file); on phones also vibration. */
export function ring() {
  try {
    navigator.vibrate?.([200, 100, 200]);
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* ohne Ton */
  }
}
