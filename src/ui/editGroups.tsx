// Ingredients in the recipe editor (issue #131): groups with an optional name, one ingredient per line.
import { Icon } from "./icons";
import { tr } from "../i18n";
import type { GroupState } from "./useRecipeDraft";

/** Rows of a text field for its content: grows with it, at least `min`. */
export const rowsFor = (text: string, min = 3): number =>
  Math.min(14, Math.max(min, text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 38)), 0) + 1));

export function EditGroups(p: {
  groups: GroupState[];
  onChange: (groups: GroupState[]) => void;
  nextId: () => number;
}) {
  const { groups } = p;
  const change = (id: number, patch: Partial<GroupState>) =>
    p.onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  return (
    <section class="rz-edit-block" aria-labelledby="rz-edit-zutaten">
      <h3 id="rz-edit-zutaten" class="rz-edit-kopf">
        {tr("editIngredients")}
      </h3>
      {groups.map((g, i) => (
        <div class="rz-edit-karte" key={g.id}>
          <div class="rz-edit-karte-kopf">
            <label class="rz-feld rz-edit-voll">
              <span class="rz-feld-name">{tr("editGroupName")}</span>
              <input
                type="text"
                value={g.title}
                enterkeyhint="next"
                onInput={(e) => change(g.id, { title: (e.target as HTMLInputElement).value })}
              />
            </label>
            {groups.length > 1 && (
              <button
                type="button"
                class="rz-symbol"
                aria-label={`${tr("editRemoveGroup")}${g.title ? `: ${g.title}` : ` ${i + 1}`}`}
                onClick={() => p.onChange(groups.filter((x) => x.id !== g.id))}
              >
                <Icon n="papierkorb" large={18} />
              </button>
            )}
          </div>
          <label class="rz-feld">
            <span class="rz-feld-name">{tr("editGroupItems")}</span>
            <textarea
              rows={rowsFor(g.text)}
              value={g.text}
              autocapitalize="sentences"
              onInput={(e) => change(g.id, { text: (e.target as HTMLTextAreaElement).value })}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        class="rz-knopf rz-knopf-klein rz-edit-neu"
        onClick={() => p.onChange([...groups, { id: p.nextId(), title: "", text: "" }])}
      >
        {tr("editAddGroup")}
      </button>
    </section>
  );
}
