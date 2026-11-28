// Steps in the recipe editor (issue #131): one card per step with title, text, up, down and delete.
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "./icons";
import { tr } from "../i18n";
import { rowsFor } from "./editGroups";
import { moved, type StepState } from "./useRecipeDraft";

export function EditSteps(p: {
  steps: StepState[];
  /** The note had ingredients lines when the editor was opened. */
  baseExplicit: boolean;
  onChange: (steps: StepState[]) => void;
  nextId: () => number;
}) {
  const { steps } = p;
  const section = useRef<HTMLElement>(null);
  // Where the focus goes after the steps changed: a moved or deleted step takes its button away or disables it.
  const focus = useRef<{ id?: number; act: "up" | "down" | "del" | "add" | "title" } | null>(null);
  useEffect(() => {
    const want = focus.current;
    focus.current = null;
    if (!want || !section.current) return;
    const card = want.id === undefined ? section.current : section.current.querySelector(`[data-step="${want.id}"]`);
    if (want.act === "title") return card?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    const order = want.act === "up" ? ["up", "down", "del"] : want.act === "down" ? ["down", "up", "del"] : [want.act];
    for (const act of order) {
      const b = card?.querySelector<HTMLButtonElement>(`button[data-act="${act}"]:not(:disabled)`);
      if (b) return b.focus({ preventScroll: true });
    }
  }, [steps]);
  const change = (id: number, patch: Partial<StepState>) =>
    p.onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  // With the first own entry in a recipe that had none the other steps get their guessed lists when the draft is made
  // (draftOfState), not while typing: an entry that is typed and deleted again changes nothing.
  const typed = steps.some((x) => x.ingredients.trim());
  const hint = !typed ? "editStepsGuessed" : p.baseExplicit ? "editStepsExplicit" : "editStepsFirst";
  return (
    <section class="rz-edit-block" aria-labelledby="rz-edit-schritte" ref={section}>
      <h3 id="rz-edit-schritte" class="rz-edit-kopf">
        {tr("editSteps")}
      </h3>
      <p class="rz-leise rz-edit-hinweis">{tr(hint)}</p>
      {steps.map((s, i) => {
        const n = tr("editStepN", { n: i + 1 });
        return (
          <div class="rz-edit-karte" key={s.id} role="group" aria-label={n} data-step={s.id}>
            <div class="rz-edit-karte-kopf">
              <span class="rz-edit-nummer">{n}</span>
              <span class="rz-edit-karte-knoepfe">
                <button
                  type="button"
                  class="rz-symbol rz-edit-hoch"
                  aria-label={`${tr("editMoveUp")}: ${n}`}
                  data-act="up"
                  disabled={i === 0}
                  onClick={() => {
                    focus.current = { id: s.id, act: "up" };
                    p.onChange(moved(steps, i, -1));
                  }}
                >
                  <Icon n="unten" large={18} />
                </button>
                <button
                  type="button"
                  class="rz-symbol"
                  aria-label={`${tr("editMoveDown")}: ${n}`}
                  data-act="down"
                  disabled={i === steps.length - 1}
                  onClick={() => {
                    focus.current = { id: s.id, act: "down" };
                    p.onChange(moved(steps, i, 1));
                  }}
                >
                  <Icon n="unten" large={18} />
                </button>
                <button
                  type="button"
                  class="rz-symbol"
                  aria-label={`${tr("editDeleteStep")}: ${n}`}
                  data-act="del"
                  onClick={() => {
                    const near = steps[i + 1] ?? steps[i - 1];
                    focus.current = near ? { id: near.id, act: "del" } : { act: "add" };
                    p.onChange(steps.filter((x) => x.id !== s.id));
                  }}
                >
                  <Icon n="papierkorb" large={18} />
                </button>
              </span>
            </div>
            <label class="rz-feld">
              <span class="rz-feld-name">{tr("editStepTitle")}</span>
              <input
                type="text"
                value={s.title}
                enterkeyhint="next"
                onInput={(e) => change(s.id, { title: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label class="rz-feld">
              <span class="rz-feld-name">{tr("editStepText")}</span>
              <textarea
                rows={rowsFor(s.text)}
                value={s.text}
                autocapitalize="sentences"
                onInput={(e) => change(s.id, { text: (e.target as HTMLTextAreaElement).value })}
              />
            </label>
            <label class="rz-feld">
              <span class="rz-feld-name">{tr("editStepIngredients")}</span>
              <input
                type="text"
                value={s.ingredients}
                enterkeyhint="next"
                onInput={(e) => change(s.id, { ingredients: (e.target as HTMLInputElement).value })}
              />
            </label>
          </div>
        );
      })}
      <button
        type="button"
        class="rz-knopf rz-knopf-klein rz-edit-neu"
        data-act="add"
        onClick={() => {
          const id = p.nextId();
          focus.current = { id, act: "title" };
          p.onChange([...steps, { id, title: "", text: "", ingredients: "" }]);
        }}
      >
        {tr("editAddStep")}
      </button>
    </section>
  );
}
