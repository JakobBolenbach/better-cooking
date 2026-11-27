// State of cooking mode together with its memory per device (src/cookingResume.ts): where it starts, and a note of
// every real step change, so closing in any way and starting again continues there.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ResumeApi } from "../cookingResume";
import type { RecipeView } from "../types";

/** Cooking mode: the recipe and its step; `resumed` is set when it continued at a remembered step (until the step changes). */
export interface CookingState {
  path: string;
  step: number;
  resumed?: boolean;
}

export function useCookingResume(o: {
  resume?: ResumeApi;
  recipes: RecipeView[];
  /** Start in cooking mode for this recipe (the preview asks for it). */
  initialPath?: string;
}) {
  const stepCount = (path: string) => o.recipes.find((r) => r.path === path)?.steps.length ?? 0;
  const begin = (path: string): CookingState => {
    const step = o.resume?.startStep(path, stepCount(path)) ?? 0;
    return { path, step, resumed: step > 0 };
  };
  const [cooking, setCooking] = useState<CookingState | null>(() => (o.initialPath ? begin(o.initialPath) : null));
  const count = cooking ? stepCount(cooking.path) : 0;
  // What was seen last: opening cooking mode is no step change and writes nothing.
  const seen = useRef<{ path: string; step: number } | null>(null);
  useEffect(() => {
    if (!cooking) {
      seen.current = null;
      return;
    }
    if (!count) return;
    const last = seen.current;
    seen.current = { path: cooking.path, step: cooking.step };
    if (last && last.path === cooking.path && last.step !== cooking.step)
      o.resume?.note(cooking.path, cooking.step, count);
  }, [cooking?.path, cooking?.step, count]);
  return {
    cooking,
    setCooking,
    /** Start cooking mode; it continues at the remembered step (the view says so and offers the first step). */
    startCooking: (path: string) => setCooking(begin(path)),
    /** Another step of the same recipe; the "continued" hint ends with it. */
    stepTo: (step: number) => cooking && setCooking({ path: cooking.path, step }),
  };
}
