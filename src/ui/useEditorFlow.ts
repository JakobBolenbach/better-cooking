// The flow of the recipe editor dialog (issue #131): load the note, save, ask before leaving with unsaved changes, and
// where the focus goes. Split off src/ui/recipeEditor.tsx.
import { useEffect, useRef, useState } from "preact/hooks";
import type { MutableRef } from "preact/hooks";
import type { EditApi, Saved } from "./editApi";
import type { RecipeDraftApi } from "./useRecipeDraft";
import { tr } from "../i18n";
import { ISSUE_KEY } from "./editFooter";
import { draftChanges, fillGuessedLists, type RecipeDraft } from "../recipeEdit";

export interface FlowOptions {
  path: string;
  api: EditApi;
  guard: MutableRef<(() => boolean) | null>;
  onDirty?: (dirty: boolean) => void;
  onSaved: (saved: Saved) => void;
  onCloseView: () => void;
}

/** Are the steps of the two drafts not the same in the same order? */
const stepsChanged = (a: RecipeDraft, b: RecipeDraft) => draftChanges(a, b).includes("steps");

/** Unsaved changes: tell the App, ask before leaving, answer the App's Esc, and keep the focus inside the dialog. */
function useLeaveGuard(o: FlowOptions, d: RecipeDraftApi, saving: boolean) {
  const [asking, setAsking] = useState(false);
  const keepButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    o.onDirty?.(d.dirty);
  }, [d.dirty]);
  useEffect(() => () => o.onDirty?.(false), []);

  // The question replaces the buttons: the focus goes to its safe answer and back to Cancel afterwards.
  const asked = useRef(false);
  useEffect(() => {
    if (asking) keepButton.current?.focus({ preventScroll: true });
    else if (asked.current) cancelButton.current?.focus({ preventScroll: true });
    asked.current = asking;
  }, [asking]);

  const requestClose = () => {
    if (saving) return;
    if (d.dirty) setAsking(true);
    else o.onCloseView();
  };
  o.guard.current = () => {
    if (saving) return true;
    if (!d.dirty) return false;
    setAsking(true);
    return true;
  };
  useEffect(() => () => void (o.guard.current = null), []);

  return { asking, setAsking, keepButton, cancelButton, requestClose };
}

export function useEditorFlow(o: FlowOptions, d: RecipeDraftApi) {
  const [loadError, setLoadError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string>();
  const alive = useRef(true);
  const path = useRef(o.path);
  path.current = o.path;

  const load = () => {
    setLoadError(undefined);
    void o.api.open(path.current).then((a) => {
      if (!alive.current) return;
      if (a.ok) {
        d.load(a.base);
        setProblem(undefined);
      } else setLoadError(a.message);
    });
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, []);

  const { asking, setAsking, keepButton, cancelButton, requestClose } = useLeaveGuard(o, d, saving);

  const save = async () => {
    const base = d.base;
    if (!base || saving || !d.dirty || d.issues.length) return;
    setSaving(true);
    setProblem(undefined);
    const draft = fillGuessedLists(d.draft, base);
    const res = await o.api.save(path.current, base, draft);
    if (!alive.current) return;
    setSaving(false);
    if (res.ok) o.onSaved({ stepsChanged: stepsChanged(base, draft) });
    else if (res.conflict) {
      d.rebase(res.base, res.parts);
      setProblem(res.message);
    } else setProblem(res.issues?.length ? tr(ISSUE_KEY[res.issues[0].code]) : res.message);
  };

  return { loadError, saving, asking, setAsking, problem, load, requestClose, save, keepButton, cancelButton };
}
