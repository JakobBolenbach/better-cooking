// The state of the recipe editor (issue #131): what the fields hold as typed (text, so a trailing line break or a half
// typed number is kept), the draft made of it (src/recipeEdit.ts), what changed and what is wrong. A new base (Reload)
// is a new editor: the component is mounted again with it.
import { useMemo, useRef, useState } from "preact/hooks";
import {
  draftChanges,
  linesOf,
  normalizeDraft,
  partText,
  typedNumber,
  validateDraft,
  type EditPart,
  type Issue,
  type RecipeDraft,
} from "../recipeEdit";

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
  /** The ingredients of the step, separated by commas (ADR 0009). */
  ingredients: string;
}

export interface EditState {
  title: string;
  result: string;
  servings: string;
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
    servings: d.servings === undefined ? "" : String(d.servings),
    timeActive: d.timeActive === undefined ? "" : String(d.timeActive),
    timeTotal: d.timeTotal === undefined ? "" : String(d.timeTotal),
    category: d.category ?? "",
    groups: (d.ingredients.length ? d.ingredients : [{ items: [] }]).map((g) => ({
      id: id(),
      title: g.title ?? "",
      text: g.items.join("\n"),
    })),
    steps: d.steps.map((s) => ({ id: id(), title: s.title ?? "", text: s.text, ingredients: s.ingredients ?? "" })),
    tips: d.tips.join("\n"),
  };
}

/** The draft of the state, with the fields the editor does not show (the list category) of the base. */
export function draftOfState(s: EditState, base: RecipeDraft): RecipeDraft {
  return {
    title: s.title,
    result: s.result,
    ...(base.servingsField ? { servingsField: true, servings: typedNumber(s.servings) } : {}),
    timeActive: typedNumber(s.timeActive),
    timeTotal: typedNumber(s.timeTotal),
    category: base.categoryList ? base.category : s.category,
    ...(base.categoryList ? { categoryList: base.categoryList } : {}),
    ingredients: s.groups.map((g) => ({ title: g.title, items: linesOf(g.text) })),
    steps: s.steps.map((x) => ({ title: x.title, text: x.text, ingredients: x.ingredients })),
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

/** The fields of the state each part of the draft is made of. */
const PART_FIELDS: Record<EditPart, (keyof EditState)[]> = {
  title: ["title"],
  yield: ["result"],
  servings: ["servings"],
  times: ["timeActive", "timeTotal"],
  category: ["category"],
  ingredients: ["groups"],
  steps: ["steps"],
  tips: ["tips"],
};

/** `fresh` with the parts in `keep` taken from `mine`. */
function mergeState(mine: EditState, fresh: EditState, keep: EditPart[]): EditState {
  const out: Record<string, unknown> = { ...fresh };
  for (const part of keep) for (const f of PART_FIELDS[part]) out[f] = mine[f];
  return out as unknown as EditState;
}

/** The fields of one part of the state. */
function pick(s: EditState, part: EditPart): Partial<EditState> {
  return Object.fromEntries(PART_FIELDS[part].map((f) => [f, s[f]]));
}

/** A part that changed in the note while the user changed it too, and the user's choice about it. */
export interface Conflict {
  part: EditPart;
  /** "open": not decided yet (Save waits); "mine": the user's version counts; "new": the note's new version counts. */
  choice: "open" | "mine" | "new";
  /** The user's version of the part, kept while the new one is taken (taking it is reversible until saved). */
  mine: Partial<EditState>;
  /** The note's new version as plain text, to look at. */
  fresh: string;
}

export interface RecipeDraftApi {
  /** The draft the editor was opened with; null until it is loaded. */
  base: RecipeDraft | null;
  /** Starts with a base: the fields hold it and nothing differs. */
  load: (base: RecipeDraft) => void;
  /**
   * The note changed meanwhile (`parts` are the parts the user changed that changed there too): the parts the user did
   * not change take the new text, the ones the user changed stay as they are. A part whose two versions are equal is no
   * conflict.
   */
  rebase: (base: RecipeDraft, parts: EditPart[]) => void;
  conflicts: Conflict[];
  /** Decides a conflict: the user's version or the note's new one; the other can be chosen again until saved. */
  choose: (part: EditPart, choice: "mine" | "new") => void;
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
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [state, setState] = useState(() => stateOf(EMPTY, nextId));
  // What the fields hold right now, also for a handler that runs after an await.
  const latest = useRef(state);
  latest.current = state;
  const draft = useMemo(() => draftOfState(state, base ?? EMPTY), [state, base]);
  const changes = useMemo(() => (base ? draftChanges(base, draft) : []), [base, draft]);
  // Only what the user changed is checked: a note that was odd to begin with can still be opened and left.
  const issues = useMemo(() => (base ? validateDraft(draft, changes) : []), [base, draft, changes]);

  const rebase = (nb: RecipeDraft, parts: EditPart[]) => {
    const mine = base ? draftChanges(base, draftOfState(latest.current, base)) : [];
    const merged = mergeState(latest.current, stateOf(normalizeDraft(nb), nextId), mine);
    const differ = draftChanges(nb, draftOfState(merged, nb));
    setState(merged);
    setBase(nb);
    setConflicts(
      parts
        .filter((part) => differ.includes(part))
        .map((part) => ({ part, choice: "open", mine: pick(merged, part), fresh: partText(nb, part) })),
    );
  };
  const choose = (part: EditPart, choice: "mine" | "new") => {
    const c = conflicts.find((x) => x.part === part);
    if (!c || !base || c.choice === choice) return;
    const mine = choice === "new" ? pick(latest.current, part) : c.mine;
    if (choice === "new") setState((s) => ({ ...s, ...pick(stateOf(normalizeDraft(base), nextId), part) }));
    else setState((s) => ({ ...s, ...c.mine }));
    setConflicts((all) => all.map((x) => (x.part === part ? { ...x, choice, mine } : x)));
  };
  return {
    base,
    // The fields start from the normalised base (as the draft is compared), so a fresh editor is never dirty.
    load: (b) => {
      setBase(b);
      setConflicts([]);
      setState(stateOf(normalizeDraft(b), nextId));
    },
    rebase,
    conflicts,
    choose,
    state,
    set: (patch) => setState((s) => ({ ...s, ...patch })),
    nextId,
    draft,
    changes,
    dirty: changes.length > 0,
    issues,
  };
}
