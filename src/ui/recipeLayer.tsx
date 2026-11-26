// The recipe page as the layer over the lists: gives RecipePage what the App and the host hold for the open recipe.
import { RecipePage } from "./recipePage";
import type { AppProps } from "./App";
import type { RecipeDialog } from "./recipeDialogs";
import type { RecipeInputs } from "./recipeInputs";
import type { RecipeView } from "../types";

export function RecipeLayer(p: {
  r: RecipeView;
  host: Pick<
    AppProps,
    | "theme"
    | "onStatus"
    | "onRating"
    | "onMade"
    | "onUndoMade"
    | "onShop"
    | "onOpenNote"
    | "canTranslate"
    | "onTranslate"
  >;
  inputs: RecipeInputs;
  languages?: { path: string; label: string }[];
  onBack: () => void;
  onCook: () => void;
  onTimer: (recipeTitle: string, title: string, sec: number) => void;
  onAttempt: () => void;
  onDialog: (kind: RecipeDialog) => void;
  onOpen: (path: string) => void;
}) {
  const { r, host, inputs } = p;
  return (
    <RecipePage
      key={r.path}
      r={r}
      theme={host.theme}
      faktor={inputs.faktorVon(r)}
      serving={inputs.servings[r.path]}
      onServing={(n) => inputs.setServing(r.path, n)}
      checked={inputs.checkedOf(r.path)}
      onCheck={(k) => inputs.toggleChecked(r.path, k)}
      onBack={p.onBack}
      onCook={p.onCook}
      onTimer={(t, s) => p.onTimer(r.title, t, s)}
      onStatus={(s) => host.onStatus(r.path, s)}
      onRating={(n) => host.onRating(r.path, n)}
      onMade={() => host.onMade(r.path)}
      onUndoMade={() => host.onUndoMade(r.path)}
      onAttempt={p.onAttempt}
      onShop={(factor, skip) => host.onShop(r.path, factor, skip)}
      onOpenNote={() => host.onOpenNote(r.path)}
      onShare={() => p.onDialog("share")}
      onPlan={() => p.onDialog("plan")}
      onTranslate={host.canTranslate && host.onTranslate ? () => p.onDialog("translate") : undefined}
      languages={p.languages}
      onOpen={p.onOpen}
    />
  );
}
