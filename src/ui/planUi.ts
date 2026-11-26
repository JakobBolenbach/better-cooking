// What is open on the meal plan page: the dialog (pick a recipe, pick a day) and the bar offering to put a removed entry
// back. It lives in the App because both are layers for Esc (src/ui/keyboard.ts).
import { useState } from "preact/hooks";
import type { PlanDialog, PlanUndo } from "./pages";

export function usePlanUi() {
  const [dialog, setDialog] = useState<PlanDialog | null>(null);
  const [undo, setUndo] = useState<PlanUndo | null>(null);
  return { dialog, setDialog, undo, setUndo };
}
export type PlanUi = ReturnType<typeof usePlanUi>;
