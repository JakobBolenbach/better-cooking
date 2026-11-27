// Top bar of the recipe page (back, share, cook and the menu with the less frequent actions, issue #119) and the language switch (issue #10).
import { Icon } from "./icons";
import { RecipeMenu, type MenuItem } from "./recipeMenu";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

export function RecipeToolbar(p: {
  r: RecipeView;
  scrolled: boolean;
  onBack: () => void;
  onTranslate?: () => void;
  /** Recipes with a source: read it again (the dialog says why it may not be possible). */
  refetch?: { onClick: () => void };
  /** Say what is wrong and fetch again with that feedback (issue #120); unset where it is not offered. */
  feedback?: { onClick: () => void };
  onShare: () => void;
  onOpenNote: () => void;
  onCook: () => void;
  /** Edit the recipe (the editor dialog); unset where the host cannot do it. */
  onEdit?: () => void;
  /** Delete the recipe (a dialog asks first); unset where the host cannot do it. */
  onDelete?: () => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}) {
  const { r, scrolled } = p;
  const items: MenuItem[] = [
    ...(p.onEdit ? [{ id: "edit", label: tr("editEdit"), icon: "stift" as const, run: p.onEdit }] : []),
    ...(p.refetch ? [{ id: "refetch", label: tr("refetch"), icon: "nochmal" as const, run: p.refetch.onClick }] : []),
    ...(p.feedback
      ? [{ id: "feedback", label: tr("feedbackMenu"), icon: "daumen" as const, run: p.feedback.onClick }]
      : []),
    ...(p.onTranslate
      ? [{ id: "translate", label: tr("translate"), icon: "sprache" as const, run: p.onTranslate }]
      : []),
    { id: "note", label: tr("openInObsidian"), icon: "notiz", run: p.onOpenNote },
    ...(p.onDelete
      ? [{ id: "delete", label: tr("deleteRecipe"), icon: "papierkorb" as const, run: p.onDelete, danger: true }]
      : []),
  ];
  return (
    <div class={`rz-detail-leiste${scrolled ? " gescrollt" : ""}`}>
      <button type="button" class="rz-zurueck" aria-label={`${tr("back")} – ${tr("appName")}`} onClick={p.onBack}>
        <Icon n="links" large={20} />
        <span>{tr("appName")}</span>
      </button>
      <span class="rz-leiste-titel" aria-hidden="true">
        {r.title}
      </span>
      <div class="rz-leiste-aktionen">
        <button type="button" class="rz-symbol" aria-label={tr("share")} onClick={p.onShare}>
          <Icon n="teilen" />
        </button>
        <RecipeMenu open={p.menuOpen} items={items} onOpen={p.onMenu} />
        {r.steps.length > 0 && (
          <button type="button" class="rz-knopf rz-knopf-haupt rz-knopf-klein" onClick={p.onCook}>
            <Icon n="flamme" large={16} />
            {tr("cook")}
          </button>
        )}
      </div>
    </div>
  );
}

export function LanguageSwitch(p: {
  r: RecipeView;
  languages: { path: string; label: string }[];
  onOpen: (path: string) => void;
}) {
  const { r } = p;
  if (p.languages.length < 2) return null;
  return (
    <div class="rz-sprachen" role="group" aria-label={tr("translateLanguage")}>
      {p.languages.map((l) => (
        <button
          key={l.path}
          type="button"
          class={`rz-sprache${l.path === r.path ? " aktiv" : ""}`}
          aria-pressed={l.path === r.path}
          onClick={() => p.onOpen(l.path)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
