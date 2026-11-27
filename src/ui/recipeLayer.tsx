// The recipe page as the layer over the lists: gives RecipePage what the App and the host hold for the open recipe.
import { RecipePage } from "./recipePage";
import { refetchAction } from "./refetchModal";
import type { AppProps } from "./appProps";
import type { RecipeDialog } from "./recipeDialogs";
import type { RecipeInputs } from "./recipeInputs";
import type { RecipeView } from "../types";
import type { SyncReport } from "../importSync";

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
    | "refetch"
    | "feedback"
    | "improve"
    | "deleteRecipe"
    | "edit"
  >;
  inputs: RecipeInputs;
  languages?: { path: string; label: string }[];
  onSyncNow?: () => Promise<SyncReport>;
  onBack: () => void;
  onCook: () => void;
  onTimer: (title: string, sec: number) => void;
  onAttempt: () => void;
  onDialog: (kind: RecipeDialog) => void;
  onOpen: (path: string) => void;
  /** The menu of the toolbar is one of the recipe's dialogs, so Esc and the dialog's rules apply to it. */
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
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
      onSyncNow={p.onSyncNow}
      onBack={p.onBack}
      onCook={p.onCook}
      onTimer={p.onTimer}
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
      refetch={refetchAction(r, !!host.refetch, () => p.onDialog("refetch"))}
      feedback={
        host.feedback && host.feedback.way(r).via !== "off" ? { onClick: () => p.onDialog("feedback") } : undefined
      }
      improve={
        r.improvement && host.improve
          ? { onClick: r.improvement === "ready" ? () => p.onDialog("improve") : undefined }
          : undefined
      }
      languages={p.languages}
      onOpen={p.onOpen}
      onEdit={host.edit ? () => p.onDialog("edit") : undefined}
      onDelete={host.deleteRecipe ? () => p.onDialog("delete") : undefined}
      menuOpen={p.menuOpen}
      onMenu={p.onMenu}
    />
  );
}
