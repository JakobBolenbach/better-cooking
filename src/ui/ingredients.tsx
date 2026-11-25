// Ingredient list with conversion and checking off, step texts with startable timers.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { ComponentChildren } from "preact";
import { durationText, findTimes, isEquipment } from "../cooking";
import { scaleLine } from "../quantities";
import type { RecipeView } from "../types";
import { Inline } from "./shared";
import { Icon } from "./icons";
import { tr } from "../i18n";

export function IngredientList({
  r,
  faktor,
  checked,
  onCheck,
  only,
}: {
  r: RecipeView;
  faktor: number;
  checked?: string[];
  onCheck?: (k: string) => void;
  only?: { group: number; index: number }[];
}) {
  return (
    <div class="rz-zutaten">
      {r.ingredients.map((g, gi) => {
        const equipment = isEquipment(g.title);
        const lines = g.ingredients
          .map((z, zi) => ({ z, zi }))
          .filter(({ zi }) => !only || only.some((n) => n.group === gi && n.index === zi));
        if (!lines.length) return null;
        return (
          <div key={gi} class={`rz-zutatengruppe${equipment ? " ausstattung" : ""}`}>
            {g.title && !only && <h3 class="rz-gruppe-titel">{g.title}</h3>}
            <ul>
              {lines.map(({ z, zi }) => {
                const k = `${gi}-${zi}`;
                const an = !!checked?.includes(k);
                const parts = equipment ? [{ text: z }] : scaleLine(z, faktor);
                const content = parts.map((t, i) =>
                  t.quantity ? (
                    <b key={i} class={faktor !== 1 ? "rz-menge neu" : "rz-menge"}>
                      {t.text}
                    </b>
                  ) : (
                    <span key={i}>
                      <Inline text={t.text} />
                    </span>
                  ),
                );
                return (
                  <li key={zi}>
                    {onCheck ? (
                      <button
                        type="button"
                        class={`rz-zutat${an ? " an" : ""}`}
                        aria-pressed={an}
                        onClick={() => onCheck(k)}
                      >
                        <span class="rz-kreis" aria-hidden="true">
                          {an && <Icon n="haken" large={13} />}
                        </span>
                        <span class="rz-zutat-text">{content}</span>
                      </button>
                    ) : (
                      <span class="rz-zutat rz-zutat-statisch">
                        <span class="rz-zutat-text">{content}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Step text with tappable durations (timers). */
export function WithTimers({
  text,
  title,
  onTimer,
}: {
  text: string;
  title: string;
  onTimer: (title: string, sec: number) => void;
}) {
  const foundTimes = findTimes(text);
  if (!foundTimes.length) return <Inline text={text} />;
  const out: ComponentChildren[] = [];
  let pos = 0;
  foundTimes.forEach((z, i) => {
    if (z.start > pos) out.push(<Inline key={`t${i}`} text={text.slice(pos, z.start)} />);
    out.push(
      <button
        key={`z${i}`}
        type="button"
        class="rz-zeit"
        onClick={() => onTimer(title, z.seconds)}
        title={tr("timerFor", { d: durationText(z.seconds) })}
      >
        <Icon n="timer" large={13} />
        {z.text}
      </button>,
    );
    pos = z.end;
  });
  if (pos < text.length) out.push(<Inline key="rest" text={text.slice(pos)} />);
  return <>{out}</>;
}

/** "Kneten (7 bis 10 Min.)" → "Kneten" plus timer chip "7 bis 10 Min." instead of a chip in parentheses. */
export function StepTitle({ title, onTimer }: { title: string; onTimer: (title: string, sec: number) => void }) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(title);
  if (m && findTimes(m[2]).length) {
    return (
      <>
        {m[1]} <WithTimers text={m[2]} title={m[1]} onTimer={onTimer} />
      </>
    );
  }
  return <WithTimers text={title} title={title} onTimer={onTimer} />;
}
