// The state of the recipe editor (issue #131): what the fields hold as typed (text, so a trailing line break or a half
// typed number is kept), the draft made of it (src/recipeEdit.ts), what changed and what is wrong. A new base (Reload)
// is a new editor: the component is mounted again with it.
import { useMemo, useRef, useState } from "preact/hooks";
import { draftChanges, linesOf, validateDraft, type EditPart, type Issue, type RecipeDraft } from "../recipeEdit";

export interface GroupState {
  id: number;
  title: string;
  /** One ingredient per line. */
  text: string;
}
export interface StepState {
  id: number;
  title: string;
  text: string;
}

export interface EditState {
  title: string;
  result: string;
  timeActive: string;
  timeTotal: string;
  category: string;
  groups: GroupState[];
  steps: StepState[];
  /** One tip per line. */
  tips: string;
}

/** The state for a draft; `id` numbers the cards (a key that survives moving them). */
export function stateOf(d: RecipeDraft, id: () => number): EditState {
  return {
    title: d.title,
    result: d.result ?? "",
    timeActive: d.timeActive === undefined ? "" : String(d.timeActive),
    timeTotal: d.timeTotal === undefined ? "" : String(d.timeTotal),
    category: d.category ?? "",
    groups: (d.ingredients.length ? d.ingredients : [{ items: [] }]).map((g) => ({
      id: id(),
      title: g.title ?? "",
      text: g.items.join("\n"),
    })),
    steps: d.steps.map((s) => ({ id: id(), title: s.title ?? "", text: s.text })),
    tips: d.tips.join("\n"),
  };
}

/** A typed number of minutes: empty is none, anything that is not a number is NaN (a check says so). */
const minutes = (s: string): number | undefined => {
  const t = s.trim().replace(",", ".");
  return t === "" ? undefined : /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};

/** The draft of the state, with the fields the editor does not show (the list category) of the base. */
export function draftOfState(s: EditState, base: RecipeDraft): RecipeDraft {
  return {
    title: s.title,
    result: s.result,
    timeActive: minutes(s.timeActive),
    timeTotal: minutes(s.timeTotal),
    category: base.categoryList ? base.category : s.category,
    ...(base.categoryList ? { categoryList: base.categoryList } : {}),
    ingredients: s.groups.map((g) => ({ title: g.title, items: linesOf(g.text) })),
    steps: s.steps.map((x) => ({ title: x.title, text: x.text })),
    tips: linesOf(s.tips),
  };
}

/** The list with the item at `i` moved by `by` places; unchanged if that is outside. */
export function moved<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export interface RecipeDraftApi {
  /** The draft the editor was opened with; null until it is loaded. */
  base: RecipeDraft | null;
  /** Starts (or, for Reload, starts again) with a base: the fields hold it and nothing differs. */
  load: (base: RecipeDraft) => void;
  state: EditState;
  /** Changes fields of the state. */
  set: (patch: Partial<EditState>) => void;
  /** A new card id. */
  nextId: () => number;
  draft: RecipeDraft;
  changes: EditPart[];
  /** Something differs from the base: Save is possible and Cancel asks first. */
  dirty: boolean;
  issues: Issue[];
}

const EMPTY: RecipeDraft = { title: "", ingredients: [], steps: [], tips: [] };

export function useRecipeDraft(): RecipeDraftApi {
  const ids = useRef(0);
  const nextId = () => ++ids.current;
  const [base, setBase] = useState<RecipeDraft | null>(null);
  const [state, setState] = useState(() => stateOf(EMPTY, nextId));
  const draft = useMemo(() => draftOfState(state, base ?? EMPTY), [state, base]);
  const changes = useMemo(() => (base ? draftChanges(base, draft) : []), [base, draft]);
  const issues = useMemo(() => (base ? validateDraft(draft) : []), [base, draft]);
  return {
    base,
    load: (b) => {
      setBase(b);
      setState(stateOf(b, nextId));
    },
    state,
    set: (patch) => setState((s) => ({ ...s, ...patch })),
    nextId,
    draft,
    changes,
    dirty: changes.length > 0,
    issues,
  };
}
