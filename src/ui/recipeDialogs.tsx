// The dialogs of an open recipe: plan, translate, share (one at a time, chosen on the recipe page).
import { PlanModal } from "./planModal";
import { ShareModal } from "./shareModal";
import { TranslateModal } from "./translateModal";
import type { RecipeView } from "../types";

export type RecipeDialog = "plan" | "translate" | "share";

export function RecipeDialogs(p: {
  dialog: RecipeDialog | null;
  r: RecipeView;
  factor: number;
  canPrint: boolean;
  onHint: (text: string) => void;
  onPlan: (path: string, date: string, factor: number) => void;
  onTranslate?: (path: string, language: string) => Promise<{ ok: boolean; message?: string; path?: string }>;
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const { r, factor } = p;
  if (p.dialog === "plan")
    return (
      <PlanModal r={r} factor={factor} onPlan={(date) => p.onPlan(r.path, date, factor)} onCloseView={p.onClose} />
    );
  if (p.dialog === "share")
    return <ShareModal r={r} factor={factor} canPrint={p.canPrint} onHint={p.onHint} onCloseView={p.onClose} />;
  if (p.dialog === "translate" && p.onTranslate) {
    const translate = p.onTranslate;
    return (
      <TranslateModal
        r={r}
        onTranslate={async (language) => {
          const res = await translate(r.path, language);
          if (res.ok) {
            p.onClose();
            if (res.path) p.onOpen(res.path);
          }
          return res;
        }}
        onCloseView={p.onClose}
      />
    );
  }
  return null;
}
