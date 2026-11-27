// Steps in the recipe editor (issue #131): one card per step with title, text, up, down and delete.
import { Icon } from "./icons";
import { tr } from "../i18n";
import { rowsFor } from "./editGroups";
import { moved, type StepState } from "./useRecipeDraft";

export function EditSteps(p: { steps: StepState[]; onChange: (steps: StepState[]) => void; nextId: () => number }) {
  const { steps } = p;
  const change = (id: number, patch: Partial<StepState>) =>
    p.onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <section class="rz-edit-block" aria-labelledby="rz-edit-schritte">
      <h3 id="rz-edit-schritte" class="rz-edit-kopf">
        {tr("editSteps")}
      </h3>
      {steps.map((s, i) => {
        const n = tr("editStepN", { n: i + 1 });
        return (
          <div class="rz-edit-karte" key={s.id} role="group" aria-label={n}>
            <div class="rz-edit-karte-kopf">
              <span class="rz-edit-nummer">{n}</span>
              <span class="rz-edit-karte-knoepfe">
                <button
                  type="button"
                  class="rz-symbol rz-edit-hoch"
                  aria-label={`${tr("editMoveUp")}: ${n}`}
                  disabled={i === 0}
                  onClick={() => p.onChange(moved(steps, i, -1))}
                >
                  <Icon n="unten" large={18} />
                </button>
                <button
                  type="button"
                  class="rz-symbol"
                  aria-label={`${tr("editMoveDown")}: ${n}`}
                  disabled={i === steps.length - 1}
                  onClick={() => p.onChange(moved(steps, i, 1))}
                >
                  <Icon n="unten" large={18} />
                </button>
                <button
                  type="button"
                  class="rz-symbol"
                  aria-label={`${tr("editDeleteStep")}: ${n}`}
                  onClick={() => p.onChange(steps.filter((x) => x.id !== s.id))}
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
          </div>
        );
      })}
      <button
        type="button"
        class="rz-knopf rz-knopf-klein rz-edit-neu"
        onClick={() => p.onChange([...steps, { id: p.nextId(), title: "", text: "" }])}
      >
        {tr("editAddStep")}
      </button>
    </section>
  );
}
