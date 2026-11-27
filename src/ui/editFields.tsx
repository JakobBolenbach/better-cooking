// The plain fields of the recipe editor (issue #131): title, yield, servings, times and category.
import { tr } from "../i18n";
import type { RecipeDraftApi } from "./useRecipeDraft";

type Field = "title" | "result" | "servings" | "timeActive" | "timeTotal" | "category";

function Text(p: {
  d: RecipeDraftApi;
  field: Field;
  label: Parameters<typeof tr>[0];
  hint?: Parameters<typeof tr>[0];
  numeric?: "numeric" | "decimal";
  invalid?: boolean;
  list?: string;
}) {
  return (
    <label class="rz-feld">
      <span class="rz-feld-name">{tr(p.label)}</span>
      <input
        type="text"
        inputMode={p.numeric}
        pattern={p.numeric === "numeric" ? "[0-9]*" : undefined}
        list={p.list}
        value={p.d.state[p.field]}
        placeholder={p.hint && tr(p.hint)}
        aria-invalid={p.invalid}
        enterkeyhint="next"
        onInput={(e) => p.d.set({ [p.field]: (e.target as HTMLInputElement).value })}
      />
    </label>
  );
}

export function EditFields(p: { d: RecipeDraftApi; categories: string[] }) {
  const { d } = p;
  const bad = (code: string) => d.issues.some((i) => i.code === code);
  return (
    <>
      <Text d={d} field="title" label="editFieldTitle" invalid={bad("title")} />
      <Text d={d} field="result" label="editFieldYield" hint="editYieldHint" />
      {d.base?.servingsField && (
        <Text d={d} field="servings" label="editFieldServings" numeric="decimal" invalid={bad("servings")} />
      )}
      <div class="rz-edit-zeiten">
        <Text d={d} field="timeActive" label="editActive" numeric="numeric" invalid={bad("time")} />
        <Text d={d} field="timeTotal" label="editTotal" numeric="numeric" invalid={bad("time")} />
      </div>
      {d.base?.categoryList ? (
        <div class="rz-feld">
          <span class="rz-feld-name">{tr("editCategory")}</span>
          <p class="rz-leise">{tr("editCategoryList", { list: d.base.categoryList.join(", ") })}</p>
        </div>
      ) : (
        <>
          <Text d={d} field="category" label="editCategory" list="rz-edit-kategorien" />
          <datalist id="rz-edit-kategorien">
            {p.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      )}
    </>
  );
}
