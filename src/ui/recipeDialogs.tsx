// The dialogs of an open recipe: plan, translate, share (one at a time, chosen on the recipe page).
import { useEffect, useRef } from "preact/hooks";
import { PlanModal } from "./planModal";
import { ShareModal } from "./shareModal";
import { TranslateModal } from "./translateModal";
import { RefetchModal } from "./refetchModal";
import type { Preview } from "../refetch";
import type { RecipeView } from "../types";

export type RecipeDialog = "plan" | "translate" | "share" | "refetch";

export function RecipeDialogs(p: {
  dialog: RecipeDialog | null;
  r: RecipeView;
  factor: number;
  canPrint: boolean;
  onHint: (text: string) => void;
  onPlan: (path: string, date: string, factor: number) => void;
  onTranslate?: (path: string, language: string) => Promise<{ ok: boolean; message?: string; path?: string }>;
  onRefetchPreview?: (path: string, useAi?: boolean) => Promise<Preview>;
  onRefetchCancel?: (path: string) => void;
  onRefetchApply?: (path: string) => Promise<{ ok: boolean; message?: string; stale?: boolean }>;
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const { r, factor } = p;
  // A translation can finish after the dialog was closed or another recipe was opened: then drop the result.
  const current = useRef({ mounted: true, path: r.path });
  current.current.path = r.path;
  useEffect(() => {
    current.current.mounted = true;
    return () => {
      current.current.mounted = false;
    };
  }, []);
  if (p.dialog === "plan")
    return (
      <PlanModal r={r} factor={factor} onPlan={(date) => p.onPlan(r.path, date, factor)} onCloseView={p.onClose} />
    );
  if (p.dialog === "share")
    return <ShareModal r={r} factor={factor} canPrint={p.canPrint} onHint={p.onHint} onCloseView={p.onClose} />;
  if (p.dialog === "refetch" && p.onRefetchPreview && p.onRefetchApply) {
    const [preview, apply] = [p.onRefetchPreview, p.onRefetchApply];
    return (
      <RefetchModal
        r={r}
        onPreview={(useAi) => preview(r.path, useAi)}
        onApply={() => apply(r.path)}
        onCancel={() => p.onRefetchCancel?.(r.path)}
        onCloseView={p.onClose}
      />
    );
  }
  if (p.dialog === "translate" && p.onTranslate) {
    const translate = p.onTranslate;
    return (
      <TranslateModal
        r={r}
        onTranslate={async (language) => {
          const res = await translate(r.path, language);
          if (res.ok && current.current.mounted && current.current.path === r.path) {
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
