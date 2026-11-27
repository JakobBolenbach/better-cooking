// The dialogs of an open recipe: plan, translate, share (one at a time, chosen on the recipe page).
import { useEffect, useRef } from "preact/hooks";
import { PlanModal } from "./planModal";
import { ShareModal } from "./shareModal";
import { TranslateModal } from "./translateModal";
import { RefetchModal, type RefetchApi } from "./refetchModal";
import type { RecipeView } from "../types";

export type RecipeDialog = "plan" | "translate" | "share" | "refetch" | "improve";

export function RecipeDialogs(p: {
  dialog: RecipeDialog | null;
  r: RecipeView;
  factor: number;
  canPrint: boolean;
  onHint: (text: string) => void;
  onPlan: (path: string, date: string, factor: number) => void;
  onTranslate?: (path: string, language: string) => Promise<{ ok: boolean; message?: string; path?: string }>;
  refetch?: RefetchApi;
  improve?: RefetchApi;
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
  if (p.dialog === "refetch" && p.refetch) {
    const api = p.refetch;
    return (
      <RefetchModal
        r={r}
        onPreview={(useAi) => api.preview(r.path, useAi)}
        onApply={(replace) => api.apply(r.path, replace)}
        onCancel={() => api.cancel(r.path)}
        onCloseView={p.onClose}
      />
    );
  }
  if (p.dialog === "improve" && p.improve) {
    const api = p.improve;
    return (
      <RefetchModal
        r={r}
        improve
        onPreview={() => api.preview(r.path)}
        onApply={(replace) => api.apply(r.path, replace)}
        onCancel={() => api.cancel(r.path)}
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
