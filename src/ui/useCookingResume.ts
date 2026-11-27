// State of cooking mode together with its memory per device (src/cookingResume.ts): where to start, and a note of
// every step change, so closing in any way and starting again continues there.
import { useEffect, useState } from "preact/hooks";
import type { ResumeApi } from "../cookingResume";
import type { RecipeView } from "../types";
import type { CookingState } from "./usePageNav";

export function useCookingResume(o: {
  resume?: ResumeApi;
  recipes: RecipeView[];
  /** Start in cooking mode for this recipe (the preview asks for it). */
  initialPath?: string;
}) {
  const stepCount = (path: string) => o.recipes.find((r) => r.path === path)?.steps.length ?? 0;
  const startStep = (path: string) => o.resume?.startStep(path, stepCount(path)) ?? 0;
  const [cooking, setCooking] = useState<CookingState | null>(() => {
    if (!o.initialPath) return null;
    const step = startStep(o.initialPath);
    return { path: o.initialPath, step, resumed: step > 0 };
  });
  const count = cooking ? stepCount(cooking.path) : 0;
  useEffect(() => {
    if (cooking && count) o.resume?.note(cooking.path, cooking.step, count);
  }, [cooking?.path, cooking?.step, count]);
  /** Another step of the same recipe; the "continued" hint ends with it. */
  const stepTo = (step: number) => cooking && setCooking({ path: cooking.path, step });
  return { cooking, setCooking, startStep, stepTo };
}
