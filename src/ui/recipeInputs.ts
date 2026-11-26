// What the user set per recipe while the view is open: servings and the ingredients checked as "already there".
import { useState } from "preact/hooks";
import type { RecipeView } from "../types";

export function useRecipeInputs() {
  const [servings, setServings] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  return {
    servings,
    setServing: (path: string, n: number) => setServings({ ...servings, [path]: n }),
    checkedOf: (path: string) => checked[path] ?? [],
    toggleChecked: (path: string, k: string) => {
      const old = checked[path] ?? [];
      setChecked({ ...checked, [path]: old.includes(k) ? old.filter((x) => x !== k) : [...old, k] });
    },
    /** Factor of the servings the user chose against the recipe's own (without a yield: the chosen value itself). */
    faktorVon: (r: RecipeView) => {
      const base = r.servings?.count;
      const value = servings[r.path];
      if (!base) return value ?? 1;
      return (value ?? base) / base;
    },
  };
}
export type RecipeInputs = ReturnType<typeof useRecipeInputs>;
